"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePosting } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { parseRhbStatement } from "@/lib/bank-statement/rhb";
import {
  autoMatch, createBfItem, deleteBfItem, deleteStatement, groupOptions, markNoEntry, markReconciled, matchLine, matchLines,
  reopenStatement, saveStatement, unmatchLine, updateBfItem,
  type BfInput, type MatchKind, type Pick,
} from "@/lib/bank-statement/service";

// Expected failures come back as values so the reason reaches the screen in
// production, where thrown messages are replaced with a generic one.
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    const data = await fn();
    for (const p of ["/bank-statements", "/settings", ...paths]) revalidatePath(p);
    revalidatePath("/bank-statements/[id]", "page");
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

/** Several lines with one book entry, or several entries with one line. */
export async function matchStatementLines(lineIds: string[], picks: Pick[]) {
  return run(async () => {
    await requirePosting();
    await matchLines(lineIds, picks);
    await recordAudit("bankStatementLine", lineIds[0], "match", { after: { lineIds, picks } });
  });
}

export async function getGroupOptions(lineId: string) {
  return run(async () => {
    await requirePosting();
    return groupOptions(lineId);
  });
}

export async function saveBfItem(id: string | null, input: BfInput) {
  return run(async () => {
    const user = await requirePosting();
    const row = id ? await updateBfItem(id, input) : await createBfItem(input, user.id);
    await recordAudit("bankBfItem", row.id, id ? "update" : "create", { after: input });
  });
}

export async function removeBfItem(id: string) {
  return run(async () => {
    await requirePosting();
    await deleteBfItem(id);
    await recordAudit("bankBfItem", id, "delete");
  });
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
