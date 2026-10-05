import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { numberInUse, type SequenceKey } from "./numbering";
import { receiptSchema, postReceipt, type ReceiptInput } from "./receipt-posting";
import { createCashEntry, type CashEntryInput } from "./cash-book";
import { supplierPaymentSchema, postSupplierPayment, type SupplierPaymentInput } from "./bill-posting";

/**
 * Drafts: receipts and payments keyed in but not yet posted, so the accountant
 * can check entries and amounts first (Settings › Checking before posting).
 *
 * A draft is only the keyed input. It has no journal entry and touches no
 * balance, report or bank match; posting runs exactly the posting a direct save
 * would and then removes the draft. Its document number is held meanwhile.
 */

export type DraftKind = "receipt" | "cashEntry" | "supplierPayment";
export type DraftPayload =
  | { kind: "receipt"; input: ReceiptInput }
  | { kind: "cashEntry"; input: CashEntryInput }
  | { kind: "supplierPayment"; input: SupplierPaymentInput };

export async function draftsRequired(associationId = DEFAULT_ASSOCIATION_ID) {
  const a = await db.association.findUnique({ where: { id: associationId }, select: { draftsRequired: true } });
  return a?.draftsRequired ?? false;
}

const tidy = (no: string | undefined) => (no ?? "").replace(/\s+/g, "").toUpperCase();

/** Checks a draft the way posting will, as far as possible without writing anything. */
async function describe(p: DraftPayload, associationId: string, draftId?: string) {
  const sum = (xs: { amount: string }[]) => xs.reduce((s, x) => s.plus(x.amount || 0), new Decimal(0));
  let key: SequenceKey, number: string, amount: Decimal, party: string, date: string, direction: string | null = null;

  if (p.kind === "receipt") {
    const input = receiptSchema.parse(p.input);
    number = tidy(input.receiptNo);
    if (!number) throw new Error("Enter the receipt number from the receipt book.");
    amount = new Decimal(input.amount || 0);
    if (input.allocations.length && sum(input.allocations).gt(amount)) throw new Error("The amounts applied add up to more than the receipt.");
    const r = await db.resident.findUnique({ where: { id: input.residentId } });
    if (!r) throw new Error("Pick the unit.");
    party = `${input.receivedFrom || r.ownerName} — ${r.unitAddress}`;
    key = "RECEIPT"; date = input.date;
    p.input = { ...input, receiptNo: number };
  } else if (p.kind === "cashEntry") {
    const input = p.input;
    number = tidy(input.refNo);
    if (!number) throw new Error("Enter the voucher number.");
    if (!input.description?.trim()) throw new Error("Describe what this is for.");
    const lines = input.lines ?? [];
    if (!lines.length || lines.some((l) => !l.accountId || new Decimal(l.amount || 0).lte(0))) throw new Error("Every line needs an account and an amount.");
    const accounts = await db.account.findMany({ where: { id: { in: lines.map((l) => l.accountId) } } });
    if (accounts.length !== new Set(lines.map((l) => l.accountId)).size) throw new Error("An account on this voucher no longer exists.");
    amount = sum(lines);
    party = input.counterparty || input.description;
    direction = input.direction;
    key = input.direction === "IN" ? "CASH_IN" : "CASH_OUT"; date = input.date;
    p.input = { ...input, refNo: number };
  } else {
    const input = supplierPaymentSchema.parse(p.input);
    number = tidy(input.voucherNo);
    if (!number) throw new Error("Enter the voucher number.");
    const allocations = input.allocations.filter((a) => new Decimal(a.amount || 0).gt(0));
    if (!allocations.length) throw new Error("Enter the amount paid against at least one bill.");
    const bills = await db.bill.findMany({ where: { id: { in: allocations.map((a) => a.billId) } } });
    for (const a of allocations) {
      const b = bills.find((x) => x.id === a.billId);
      if (!b || b.supplierId !== input.supplierId) throw new Error("A bill on this voucher isn't this supplier's.");
      const open = new Decimal(b.amount.toString()).minus(b.paid.toString());
      if (new Decimal(a.amount).gt(open)) throw new Error(`RM ${a.amount} is more than the RM ${open.toFixed(2)} still owing on bill ${b.invoiceNo}.`);
    }
    amount = sum(allocations);
    party = (await db.supplier.findUniqueOrThrow({ where: { id: input.supplierId } })).name;
    key = "CASH_OUT"; date = input.date;
    p.input = { ...input, voucherNo: number, allocations };
  }

  if (amount.lte(0)) throw new Error("The amount must be greater than zero.");
  if (await numberInUse(key, number, associationId, draftId)) {
    throw new Error(`${number} is already in the system or held by another draft. Check the number in the book.`);
  }
  return { number, amount, party, date: new Date(date), direction };
}

/** Saves a new draft, or replaces an existing one's contents when draftId is given. */
export async function saveDraft(p: DraftPayload, createdBy: string | null, draftId?: string, associationId = DEFAULT_ASSOCIATION_ID) {
  const d = await describe(p, associationId, draftId);
  const data = {
    kind: p.kind, direction: d.direction, number: d.number, date: d.date, amount: d.amount.toFixed(2),
    party: d.party, payload: p.input as unknown as Prisma.InputJsonValue,
  };
  return draftId
    ? db.draft.update({ where: { id: draftId }, data })
    : db.draft.create({ data: { ...data, associationId, createdBy } });
}

/** Where the posted document can be seen. */
export type Posted = { number: string; href: string };

/**
 * Posts a draft through the normal posting and removes it. The draft is taken
 * out first so its held number doesn't count against itself, and put back
 * unchanged if posting is refused (a locked month, a bill already paid…).
 */
export async function postDraft(id: string): Promise<Posted> {
  const draft = await db.draft.findUniqueOrThrow({ where: { id } });
  await db.draft.delete({ where: { id } });
  try {
    if (draft.kind === "receipt") {
      const r = await postReceipt(draft.payload as unknown as ReceiptInput);
      return { number: r.receiptNo, href: `/receipts/${r.id}` };
    }
    if (draft.kind === "cashEntry") {
      const c = await createCashEntry(draft.payload as unknown as CashEntryInput);
      return { number: c.refNo, href: `/cash-book/${c.id}` };
    }
    const v = await postSupplierPayment(draft.payload as unknown as SupplierPaymentInput);
    return { number: v.voucherNo, href: `/bills/voucher/${v.entryId}` };
  } catch (e) {
    await db.draft.create({
      data: {
        id: draft.id, associationId: draft.associationId, kind: draft.kind, direction: draft.direction, number: draft.number,
        date: draft.date, amount: draft.amount, party: draft.party, payload: draft.payload as Prisma.InputJsonValue,
        createdBy: draft.createdBy, createdAt: draft.createdAt,
      },
    });
    throw e;
  }
}
