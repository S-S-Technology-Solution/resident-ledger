import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

export async function nextInvoiceNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
): Promise<string> {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}${mm}`;
  const last = await db.charge.findFirst({
    where: { associationId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });
  const n = last?.invoiceNo ? parseInt(last.invoiceNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
