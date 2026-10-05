/** What a draft is, in the words the treasurer uses. Shared by server pages and the drafts list. */
export const draftKindLabel = (d: { kind: string; direction: string | null }) =>
  d.kind === "receipt" ? "Resident receipt"
  : d.kind === "supplierPayment" ? "Supplier payment"
  : d.direction === "IN" ? "Cash book receipt" : "Payment voucher";
