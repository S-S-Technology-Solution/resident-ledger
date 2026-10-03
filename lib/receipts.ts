import { DEFAULT_ASSOCIATION_ID } from "./association";
import { nextNumber } from "./numbering";

export async function nextReceiptNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
): Promise<string> {
  return nextNumber("RECEIPT", date, associationId);
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

/**
 * The amount as written on the Official Receipt after "The Sum of Ringgit":
 * 6720 → "Six Thousand Seven Hundred And Twenty Only",
 * 1440.50 → "One Thousand Four Hundred And Forty And Fifty Sen Only".
 */
export function ringgitInWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const below100 = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : ""));
  const below1000 = (n: number) => {
    const h = Math.floor(n / 100), r = n % 100;
    return [h ? `${ones[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" And ");
  };
  const words = (n: number) => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const m = Math.floor(n / 1_000_000), t = Math.floor((n % 1_000_000) / 1000), r = n % 1000;
    if (m) parts.push(`${below1000(m)} Million`);
    if (t) parts.push(`${below1000(t)} Thousand`);
    if (r) parts.push(r < 100 && parts.length ? `And ${below100(r)}` : below1000(r));
    return parts.join(" ");
  };
  const cents = Math.round(amount * 100);
  const ringgit = Math.floor(cents / 100), sen = cents % 100;
  return sen ? `${words(ringgit)} And ${words(sen)} Sen Only` : `${words(ringgit)} Only`;
}
