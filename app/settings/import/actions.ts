"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { parseCsvRecords, pick, parseMoney } from "@/lib/csv";

export type ImportKind = "residents" | "suppliers" | "debtorOpening" | "accounts";

export type ImportRow = { line: number; summary: string; action: string; problem?: string };
export type ImportResult = {
  rows: ImportRow[];
  ok: number;
  problems: number;
  applied: boolean;
};

/**
 * CSV import with a dry run.
 *
 * Nothing is written unless `apply` is true, so the same code produces the
 * preview and does the work — a preview can never disagree with what happens.
 */
export async function importCsv(
  kind: ImportKind,
  text: string,
  apply: boolean,
): Promise<ImportResult> {
  await requireAdmin();
  const records = parseCsvRecords(text);
  if (records.length === 0) throw new Error("No data rows found — check the file has a header row.");

  const rows: ImportRow[] =
    kind === "residents" ? await importResidents(records, apply)
    : kind === "suppliers" ? await importSuppliers(records, apply)
    : kind === "debtorOpening" ? await importDebtorOpening(records, apply)
    : await importAccounts(records, apply);

  const problems = rows.filter((r) => r.problem).length;

  if (apply) {
    await recordAudit("import", kind, "run", {
      after: { rows: rows.length, applied: rows.length - problems, problems },
    });
    revalidatePath("/residents");
    revalidatePath("/suppliers");
    revalidatePath("/accounts");
    revalidatePath("/opening-balances");
  }

  return { rows, ok: rows.length - problems, problems, applied: apply };
}

async function importResidents(records: Record<string, string>[], apply: boolean) {
  const rows: ImportRow[] = [];
  const existing = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    select: { id: true, unitAddress: true },
  });
  const byUnit = new Map(existing.map((r) => [r.unitAddress.toLowerCase(), r.id]));

  for (const [i, rec] of records.entries()) {
    const line = i + 2;
    const unit = pick(rec, "unit", "unitaddress", "unit address", "address");
    const owner = pick(rec, "owner", "ownername", "owner name", "name");
    const code = pick(rec, "debtorcode", "debtor code", "debtor a/c", "code");
    const phone = pick(rec, "phone", "contact", "tel");
    const feeRaw = pick(rec, "monthlyfee", "monthly fee", "fee");
    const fee = feeRaw ? parseMoney(feeRaw) : null;

    if (!unit) { rows.push({ line, summary: owner || "(blank)", action: "skip", problem: "No unit address" }); continue; }
    if (!owner) { rows.push({ line, summary: unit, action: "skip", problem: "No owner name" }); continue; }
    if (feeRaw && fee === null) {
      rows.push({ line, summary: unit, action: "skip", problem: `Monthly fee "${feeRaw}" is not a number` });
      continue;
    }

    const id = byUnit.get(unit.toLowerCase());
    rows.push({ line, summary: `${unit} — ${owner}`, action: id ? "update" : "create" });

    if (!apply) continue;
    const data = {
      ownerName: owner,
      phone: phone || null,
      debtorCode: code || null,
      ...(fee !== null ? { monthlyFee: fee.toFixed(2) } : {}),
    };
    if (id) await db.resident.update({ where: { id }, data });
    else {
      await db.resident.create({
        data: {
          associationId: DEFAULT_ASSOCIATION_ID,
          unitAddress: unit,
          monthlyFee: fee !== null ? fee.toFixed(2) : "0",
          ...data,
        },
      });
    }
  }
  return rows;
}

async function importSuppliers(records: Record<string, string>[], apply: boolean) {
  const rows: ImportRow[] = [];
  const existing = await db.supplier.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s.id]));

  for (const [i, rec] of records.entries()) {
    const line = i + 2;
    const name = pick(rec, "name", "supplier", "company");
    const code = pick(rec, "creditorcode", "creditor code", "creditor a/c", "code");
    const contact = pick(rec, "contact", "contactperson", "contact person");
    const phone = pick(rec, "phone", "tel");
    const bank = pick(rec, "bankaccount", "bank account", "bank");

    if (!name) { rows.push({ line, summary: "(blank)", action: "skip", problem: "No supplier name" }); continue; }

    const id = byName.get(name.toLowerCase());
    rows.push({ line, summary: name, action: id ? "update" : "create" });

    if (!apply) continue;
    const data = {
      name,
      creditorCode: code || null,
      contact: contact || null,
      phone: phone || null,
      bankAccount: bank || null,
    };
    if (id) await db.supplier.update({ where: { id }, data });
    else await db.supplier.create({ data: { associationId: DEFAULT_ASSOCIATION_ID, ...data } });
  }
  return rows;
}

async function importDebtorOpening(records: Record<string, string>[], apply: boolean) {
  const rows: ImportRow[] = [];
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    select: { id: true, unitAddress: true, debtorCode: true },
  });
  const byUnit = new Map(residents.map((r) => [r.unitAddress.toLowerCase(), r]));
  const byCode = new Map(residents.filter((r) => r.debtorCode).map((r) => [r.debtorCode!.toLowerCase(), r]));

  const assoc = await db.association.findUnique({
    where: { id: DEFAULT_ASSOCIATION_ID },
    select: { openingDate: true },
  });
  const date = assoc?.openingDate ?? new Date(Date.UTC(new Date().getFullYear() - 1, 11, 31));

  for (const [i, rec] of records.entries()) {
    const line = i + 2;
    const unit = pick(rec, "unit", "unitaddress", "unit address", "address");
    const code = pick(rec, "debtorcode", "debtor code", "debtor a/c", "code");
    const raw = pick(rec, "amount", "balance", "bf", "b/f", "opening", "openingbalance");
    const amount = parseMoney(raw);

    const resident = (code && byCode.get(code.toLowerCase())) || (unit && byUnit.get(unit.toLowerCase()));
    if (!resident) {
      rows.push({ line, summary: unit || code || "(blank)", action: "skip", problem: "No matching resident" });
      continue;
    }
    if (amount === null) {
      rows.push({ line, summary: resident.unitAddress, action: "skip", problem: `Amount "${raw}" is not a number` });
      continue;
    }

    rows.push({
      line,
      summary: `${resident.unitAddress} — ${amount.toFixed(2)}`,
      action: amount === 0 ? "clear" : amount > 0 ? "owing" : "in credit",
    });

    if (!apply) continue;
    const key = resident.debtorCode ?? resident.unitAddress;
    const old = await db.charge.findMany({
      where: { residentId: resident.id, isOpeningBalance: true },
      select: { id: true },
    });
    if (old.length) {
      await db.paymentAllocation.deleteMany({ where: { chargeId: { in: old.map((c) => c.id) } } });
      await db.charge.deleteMany({ where: { id: { in: old.map((c) => c.id) } } });
    }
    await db.receipt.deleteMany({ where: { residentId: resident.id, isOpeningBalance: true } });

    if (amount > 0) {
      await db.charge.create({
        data: {
          associationId: DEFAULT_ASSOCIATION_ID,
          residentId: resident.id,
          invoiceNo: `BF-${key}`,
          periodMonth: date.getMonth() + 1,
          periodYear: date.getFullYear(),
          amount: amount.toFixed(2),
          description: "Balance brought forward",
          date,
          isOpeningBalance: true,
        },
      });
    } else if (amount < 0) {
      await db.receipt.create({
        data: {
          associationId: DEFAULT_ASSOCIATION_ID,
          receiptNo: `BF-${key}`,
          residentId: resident.id,
          date,
          amount: Math.abs(amount).toFixed(2),
          method: "BF",
          isOpeningBalance: true,
        },
      });
    }
  }
  return rows;
}

async function importAccounts(records: Record<string, string>[], apply: boolean) {
  const rows: ImportRow[] = [];
  const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
  const NORMAL: Record<string, "DEBIT" | "CREDIT"> = {
    ASSET: "DEBIT", EXPENSE: "DEBIT", LIABILITY: "CREDIT", EQUITY: "CREDIT", INCOME: "CREDIT",
  };

  for (const [i, rec] of records.entries()) {
    const line = i + 2;
    const code = pick(rec, "code", "a/c no.", "a/c no", "account", "accountno");
    const name = pick(rec, "name", "description", "accountname");
    const typeRaw = pick(rec, "type", "a/c type", "accounttype").toUpperCase();
    const group = pick(rec, "group", "a/c group", "accountgroup");
    const classified = pick(rec, "classifiedas", "classified as", "classified a/c");

    if (!code) { rows.push({ line, summary: name || "(blank)", action: "skip", problem: "No account code" }); continue; }
    if (!name) { rows.push({ line, summary: code, action: "skip", problem: "No description" }); continue; }
    const type = TYPES.find((t) => t === typeRaw);
    if (!type) {
      rows.push({ line, summary: code, action: "skip", problem: `Type "${typeRaw}" must be one of ${TYPES.join(", ")}` });
      continue;
    }

    const existing = await db.account.findUnique({
      where: { associationId_code: { associationId: DEFAULT_ASSOCIATION_ID, code } },
      select: { id: true },
    });
    rows.push({ line, summary: `${code} — ${name}`, action: existing ? "update" : "create" });

    if (!apply) continue;
    await db.account.upsert({
      where: { associationId_code: { associationId: DEFAULT_ASSOCIATION_ID, code } },
      update: { name, type, normalSide: NORMAL[type], group, classifiedAs: classified || null, active: true },
      create: {
        associationId: DEFAULT_ASSOCIATION_ID,
        code, name, type, normalSide: NORMAL[type],
        group, classifiedAs: classified || null,
      },
    });
  }
  return rows;
}
