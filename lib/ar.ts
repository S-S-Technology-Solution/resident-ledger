import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * Per-resident AR balance = sum(active charges) - sum(payment allocations on non-voided receipts).
 */
export async function residentBalances() {
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    include: {
      charges: {
        where: { voided: false },
        select: { id: true, amount: true, date: true },
      },
      receipts: {
        where: { voided: false },
        select: { id: true, amount: true },
      },
    },
  });
  return residents.map((r) => {
    const charges = r.charges.reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0));
    const paid = r.receipts.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    return {
      id: r.id,
      unitAddress: r.unitAddress,
      ownerName: r.ownerName,
      debtorCode: r.debtorCode,
      monthlyFee: new Decimal(r.monthlyFee.toString()),
      active: r.active,
      charges,
      paid,
      balance: charges.minus(paid),
    };
  });
}

export async function residentOutstanding(residentId: string) {
  const charges = await db.charge.findMany({
    where: { residentId, voided: false },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { allocations: { include: { receipt: true } } },
  });
  return charges.map((c) => {
    const allocated = c.allocations
      .filter((a) => !a.receipt.voided)
      .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
    return {
      id: c.id,
      date: c.date,
      description: c.description,
      periodMonth: c.periodMonth,
      periodYear: c.periodYear,
      amount: new Decimal(c.amount.toString()),
      allocated,
      open: new Decimal(c.amount.toString()).minus(allocated),
    };
  });
}

export function ageingBucket(chargeDate: Date, asOf: Date): "current" | "d1_30" | "d31_60" | "d61_90" | "d90p" {
  const days = Math.floor((asOf.getTime() - chargeDate.getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90p";
}
