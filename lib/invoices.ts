import { DEFAULT_ASSOCIATION_ID } from "./association";
import { nextNumber } from "./numbering";

export async function nextInvoiceNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
): Promise<string> {
  return nextNumber("INVOICE", date, associationId);
}
