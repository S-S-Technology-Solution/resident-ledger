import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * Journal voucher lines on a debtor account (e.g. 3000/A11). In the G/L such a
 * line is on the AR control account; on posting it also goes on the resident's
 * own account, stored as the document whose effect it has (see lib/notes.ts):
 *
 *   debit   a charge  (kind JOURNAL)    set against money the resident has in hand
 *   credit  a receipt (method JOURNAL)  set against their oldest unpaid charges
 *
 * so balances, statements, ageing and the debtor ledger include it as they are.
 * Neither is money, so receipts, collections and sales reports leave them out.
 */

/** Value of a resident in the journal editor's account picker. */
export const RESIDENT_PICK = "res:";

/** Receipt methods where no money changes hands. */
export const NON_CASH_METHODS = ["CREDIT_NOTE", "JOURNAL"];
/** Charge kinds that are not a sale: money paid back, and journal adjustments. */
export const NOT_SALES_KINDS = ["REFUND", "JOURNAL"];

/**
 * What the journal editor can post to: the chart of accounts, and each
 * resident's debtor account (3000/A11 …) in code order beside them. Residents
 * who have moved out stay on the list, as their balances may still need clearing.
 */
export async function journalAccountOptions(associationId = DEFAULT_ASSOCIATION_ID) {
  const [accounts, residents] = await Promise.all([
    db.account.findMany({
      where: { associationId, active: true },
      select: { id: true, code: true, name: true },
    }),
    db.resident.findMany({
      where: { associationId },
      select: { id: true, debtorCode: true, unitAddress: true, ownerName: true },
    }),
  ]);
  return [
    ...accounts,
    ...residents.map((r) => ({ id: `${RESIDENT_PICK}${r.id}`, code: r.debtorCode ?? r.unitAddress, name: r.ownerName })),
  ].sort((a, b) => a.code.localeCompare(b.code));
}

type Tx = Prisma.TransactionClient;
type Line = { residentId: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; memo: string | null };

/** Puts each resident line of a journal entry, being posted, on the resident's account. */
export async function postResidentLines(
  tx: Tx,
  entry: { id: string; associationId: string; entryNo: string; reference: string | null; description: string; date: Date; lines: Line[] },
) {
  const lines = entry.lines.filter((l) => l.residentId);
  if (!lines.length) return;
  const residents = new Map((await tx.resident.findMany({
    where: { id: { in: lines.map((l) => l.residentId!) } },
    select: { id: true, debtorCode: true, ownerName: true },
  })).map((r) => [r.id, r]));

  // Numbered after the voucher and the debtor account, e.g. JV260102/A11.
  const base = entry.reference?.trim() || entry.entryNo;
  const taken = new Set<string>();
  const numberFor = async (residentId: string, inUse: (no: string) => Promise<boolean>) => {
    const code = residents.get(residentId)?.debtorCode?.split("/").pop() || residentId.slice(-6);
    let no = `${base}/${code}`;
    for (let n = 2; taken.has(no) || (await inUse(no)); n++) no = `${base}/${code}-${n}`;
    taken.add(no);
    return no;
  };
  const { associationId, date } = entry;

  for (const l of lines) {
    const residentId = l.residentId!;
    // The memo names the resident for the G/L; on their own account the voucher's description says more.
    const r = residents.get(residentId);
    const memo = (l.memo?.trim() !== `${r?.debtorCode ?? ""} ${r?.ownerName ?? ""}`.trim() && l.memo?.trim()) || entry.description;
    const debit = new Decimal(l.debit.toString());
    const credit = new Decimal(l.credit.toString());

    if (debit.gt(0)) {
      const invoiceNo = await numberFor(residentId, async (no) => !!(await tx.charge.findFirst({ where: { associationId, invoiceNo: no } })));
      const charge = await tx.charge.create({
        data: {
          associationId, residentId, invoiceNo, kind: "JOURNAL", entryId: entry.id, date,
          periodMonth: date.getUTCMonth() + 1, periodYear: date.getUTCFullYear(),
          amount: debit.toFixed(2), description: `Journal voucher — ${memo}`,
        },
      });
      // Money the resident already has in hand (e.g. in credit b/f) settles it, oldest first.
      let left = debit;
      const receipts = await tx.receipt.findMany({
        where: { residentId, voided: false },
        include: { allocations: { include: { charge: { select: { voided: true } } } } },
        orderBy: { date: "asc" },
      });
      for (const r of receipts) {
        if (left.lte(0)) break;
        const used = r.allocations.filter((a) => !a.charge.voided).reduce((s, a) => s.plus(a.amount.toString()), new Decimal(0));
        const free = new Decimal(r.amount.toString()).minus(used);
        if (free.lte(0)) continue;
        const take = Decimal.min(free, left);
        await tx.paymentAllocation.create({ data: { receiptId: r.id, chargeId: charge.id, amount: take.toFixed(2) } });
        left = left.minus(take);
      }
    } else if (credit.gt(0)) {
      const receiptNo = await numberFor(residentId, async (no) => !!(await tx.receipt.findFirst({ where: { associationId, receiptNo: no } })));
      // Set against the oldest unpaid charges, as a credit note is.
      const charges = await tx.charge.findMany({
        where: { residentId, voided: false },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: { allocations: { include: { receipt: { select: { voided: true } } } } },
      });
      const allocations: { chargeId: string; amount: string }[] = [];
      let left = credit;
      for (const c of charges) {
        if (left.lte(0)) break;
        const paid = c.allocations.filter((a) => !a.receipt.voided).reduce((s, a) => s.plus(a.amount.toString()), new Decimal(0));
        const open = new Decimal(c.amount.toString()).minus(paid);
        if (open.lte(0)) continue;
        const take = Decimal.min(open, left);
        allocations.push({ chargeId: c.id, amount: take.toFixed(2) });
        left = left.minus(take);
      }
      await tx.receipt.create({
        data: {
          associationId, residentId, receiptNo, date, amount: credit.toFixed(2), method: "JOURNAL",
          receivedFrom: memo, entryId: entry.id,
          allocations: { create: allocations },
        },
      });
    }
  }
}

/** Takes a voided journal entry's resident lines back off the residents' accounts. */
export async function voidResidentLines(tx: Tx, entryId: string) {
  const charges = await tx.charge.findMany({ where: { entryId, kind: "JOURNAL", voided: false }, select: { id: true } });
  // Payments set against a charge that no longer stands are free again.
  if (charges.length) await tx.paymentAllocation.deleteMany({ where: { chargeId: { in: charges.map((c) => c.id) } } });
  await tx.charge.updateMany({ where: { entryId, kind: "JOURNAL", voided: false }, data: { voided: true } });
  await tx.receipt.updateMany({
    where: { entryId, method: "JOURNAL", voided: false },
    data: { voided: true, voidReason: "Journal voucher voided" },
  });
}
