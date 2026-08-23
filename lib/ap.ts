import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

export async function supplierBalances() {
  const suppliers = await db.supplier.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { name: "asc" },
    include: {
      bills: { where: { status: { not: "VOIDED" } }, select: { amount: true, paid: true } },
    },
  });
  return suppliers.map((s) => {
    const billed = s.bills.reduce((a, b) => a.plus(new Decimal(b.amount.toString())), new Decimal(0));
    const paid = s.bills.reduce((a, b) => a.plus(new Decimal(b.paid.toString())), new Decimal(0));
    return {
      id: s.id,
      name: s.name,
      creditorCode: s.creditorCode,
      contact: s.contact,
      phone: s.phone,
      active: s.active,
      billed,
      paid,
      balance: billed.minus(paid),
    };
  });
}
