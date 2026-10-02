"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requirePosting } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { createCashEntry } from "@/lib/cash-book";
import { parseRhbStatement } from "@/lib/bank-statement/rhb";
import { isBankCharge } from "@/lib/bank-statement/match";
import {
  autoMatch, deleteStatement, markNoEntry, markReconciled, matchLine, reopenStatement, saveStatement, unmatchLine,
  type MatchKind,
} from "@/lib/bank-statement/service";
import { postReceipt } from "@/lib/receipt-posting";

// Expected failures come back as values so the reason reaches the screen in
// production, where thrown messages are replaced with a generic one.
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    const data = await fn();
    for (const p of ["/bank-statements", "/settings", ...paths]) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadStatement(_prev: unknown, formData: FormData): Promise<Result<{ id: string }>> {
  return run(async () => {
    const user = await requirePosting();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose the statement PDF to upload.");
    if (file.size > MAX_BYTES) throw new Error("That file is over 4 MB — is it the right statement?");
    if (!/\.pdf$/i.test(file.name)) throw new Error("Upload the statement as the PDF from RHB.");

    const parsed = await parseRhbStatement(new Uint8Array(await file.arrayBuffer()));
    const statement = await saveStatement(parsed, file.name, user.id);
    await recordAudit("bankStatement", statement.id, "upload", {
      after: { fileName: file.name, periodFrom: parsed.periodFrom, periodTo: parsed.periodTo, lines: parsed.lines.length },
    });
    return { id: statement.id };
  });
}

export async function autoMatchStatement(statementId: string) {
  return run(async () => {
    await requirePosting();
    return autoMatch(statementId);
  }, [`/bank-statements/${statementId}`]);
}

export async function matchStatementLine(lineId: string, kind: MatchKind, itemId: string) {
  return run(async () => {
    await requirePosting();
    await matchLine(lineId, kind, itemId);
  });
}

export async function unmatchStatementLine(lineId: string) {
  return run(async () => {
    await requirePosting();
    await unmatchLine(lineId);
    await recordAudit("bankStatementLine", lineId, "unmatch");
  });
}

export async function markLineNoEntry(lineId: string, note: string) {
  return run(async () => {
    await requirePosting();
    if (!note.trim()) throw new Error("Say why this line needs no entry — it appears on the reconciliation.");
    await markNoEntry(lineId, note.trim());
  });
}

const receiptSchema = z.object({ lineId: z.string(), residentId: z.string().min(1, "Pick the resident") });

/** Takes a resident's payment straight from the statement line and pairs the two. */
export async function receiptFromLine(input: z.infer<typeof receiptSchema>) {
  return run(async () => {
    await requirePosting();
    const data = receiptSchema.parse(input);
    const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: data.lineId } });
    if (line.matchKind) throw new Error(`Line ${line.ref} is already matched.`);
    if (Number(line.credit) <= 0) throw new Error("Only money in can become a resident receipt.");
    const receipt = await postReceipt({
      residentId: data.residentId,
      date: line.date.toISOString().slice(0, 10),
      amount: line.credit.toString(),
      method: "BANK",
      bankRef: line.serial ?? undefined,
      allocations: [],
    });
    await matchLine(line.id, "receipt", receipt.id);
    revalidatePath(`/residents/${data.residentId}`);
    return receipt;
  }, ["/receipts"]);
}

const cashSchema = z.object({
  lineId: z.string(),
  accountId: z.string().min(1, "Pick an account"),
  description: z.string().min(1, "Describe what this is for"),
  counterparty: z.string().optional(),
});

/** Enters a bank charge, interest, or sundry payment from the line and pairs them. */
export async function cashEntryFromLine(input: z.infer<typeof cashSchema>) {
  return run(async () => {
    await requirePosting();
    const data = cashSchema.parse(input);
    const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: data.lineId } });
    if (line.matchKind) throw new Error(`Line ${line.ref} is already matched.`);
    const isIn = Number(line.credit) > 0;
    const entry = await createCashEntry({
      direction: isIn ? "IN" : "OUT",
      date: line.date.toISOString().slice(0, 10),
      amount: (isIn ? line.credit : line.debit).toString(),
      description: data.description,
      accountId: data.accountId,
      counterparty: data.counterparty,
      method: "BANK",
      bankRef: line.ref,
      chequeNo: !isIn && line.serial ? String(Number(line.serial)) : undefined,
    });
    await matchLine(line.id, "cashEntry", entry.id);
    return { refNo: entry.refNo };
  }, ["/cash-book"]);
}

/** Enters every unmatched bank-charge line on the statement to the bank charges account. */
export async function enterBankCharges(statementId: string) {
  return run(async () => {
    await requirePosting();
    const account = await db.account.findFirst({
      where: { associationId: DEFAULT_ASSOCIATION_ID, code: { startsWith: "90B1" }, active: true },
    });
    if (!account) throw new Error("There is no bank charges account (90B1) in the chart of accounts.");
    const lines = await db.bankStatementLine.findMany({
      where: { statementId, matchKind: null, debit: { gt: 0 } },
      orderBy: { lineNo: "asc" },
    });
    let n = 0;
    for (const line of lines.filter((l) => isBankCharge(l.type))) {
      const entry = await createCashEntry({
        direction: "OUT",
        date: line.date.toISOString().slice(0, 10),
        amount: line.debit.toString(),
        description: `Bank charge — ${line.type}`,
        accountId: account.id,
        counterparty: "RHB Bank",
        method: "BANK",
        bankRef: line.ref,
      });
      await matchLine(line.id, "cashEntry", entry.id);
      n++;
    }
    return n;
  }, ["/cash-book"]);
}

export async function signOffStatement(statementId: string) {
  return run(async () => {
    const user = await requirePosting();
    await markReconciled(statementId, user.id);
    await recordAudit("bankStatement", statementId, "reconciled");
  });
}

export async function reopenBankStatement(statementId: string) {
  return run(async () => {
    await requirePosting();
    await reopenStatement(statementId);
    await recordAudit("bankStatement", statementId, "reopen");
  });
}

export async function deleteBankStatement(statementId: string) {
  return run(async () => {
    await requirePosting();
    const s = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId } });
    await deleteStatement(statementId);
    await recordAudit("bankStatement", statementId, "delete", { before: { fileName: s.fileName, periodFrom: s.periodFrom } });
  });
}
