import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { nextNumber } from "./numbering";

export async function nextInvoiceNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
): Promise<string> {
  return nextNumber("INVOICE", date, async (stem) => {
    const last = await db.charge.findFirst({
      where: { associationId, invoiceNo: { startsWith: stem } },
      orderBy: { invoiceNo: "desc" },
      select: { invoiceNo: true },
    });
    return last?.invoiceNo ?? null;
  }, associationId);
}
