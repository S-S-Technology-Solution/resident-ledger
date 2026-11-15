import type { ScreenKey } from "./screens";

/** The document an entry was posted from, and the screen it lives on. */
export function sourceDocument(e: { id: string; source: string; sourceId: string | null }): { label: string; href: string; screen: ScreenKey } | null {
  const id = e.sourceId;
  switch (e.source) {
    case "receipt": return id ? { label: "Open the receipt", href: `/receipts/${id}`, screen: "receipts" } : null;
    case "creditnote": return id ? { label: "Open the credit note", href: `/receipts/${id}`, screen: "receipts" } : null;
    case "charge": return id ? { label: "Open the charge", href: `/charges/${id}`, screen: "charges" } : null;
    case "debitnote": return id ? { label: "Open the debit note", href: `/charges/${id}`, screen: "charges" } : null;
    case "refund": return id ? { label: "Open the refund", href: `/charges/${id}`, screen: "charges" } : null;
    case "bill": return id ? { label: "Open the bill", href: `/bills/${id}`, screen: "bills" } : null;
    case "billpayment":
    case "supplierdebitnote": return { label: "Open the payment voucher", href: `/bills/voucher/${e.id}`, screen: "bills" };
    case "cash": return id ? { label: "Open the cash book entry", href: `/cash-book/${id}`, screen: "cash-book" } : null;
    case "manual": return { label: "Open in Journal", href: `/journal/${e.id}`, screen: "journal" };
    default: return null;
  }
}

export const SOURCE_LABEL: Record<string, string> = {
  receipt: "Official receipt", creditnote: "Credit note", charge: "Charge", debitnote: "Debit note",
  refund: "Refund", bill: "Supplier bill", billpayment: "Payment voucher", supplierdebitnote: "Supplier debit note",
  cash: "Cash book", manual: "Journal voucher", opening: "Opening balance", yearend: "Year-end closing", reversal: "Reversal",
};
