import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

export async function nextReceiptNo(associationId = DEFAULT_ASSOCIATION_ID): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `OR-${yy}${mm}`;
  const last = await db.receipt.findFirst({
    where: { associationId, receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  const n = last ? parseInt(last.receiptNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

export function amountInWords(amount: number): string {
  const sen = Math.round((amount - Math.floor(amount)) * 100);
  const ringgit = Math.floor(amount);
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function chunk(n: number): string {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + chunk(n % 100) : "");
  }
  function intToWords(n: number): string {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const million = Math.floor(n / 1_000_000);
    const thousand = Math.floor((n % 1_000_000) / 1000);
    const rest = n % 1000;
    if (million) parts.push(chunk(million) + " Million");
    if (thousand) parts.push(chunk(thousand) + " Thousand");
    if (rest) parts.push(chunk(rest));
    return parts.join(" ");
  }
  const base = `Ringgit Malaysia ${intToWords(ringgit)}`;
  return sen > 0 ? `${base} and ${intToWords(sen)} Sen Only` : `${base} Only`;
}
