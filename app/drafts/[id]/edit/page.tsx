import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { residentOutstanding } from "@/lib/ar";
import type { ReceiptInput } from "@/lib/receipt-posting";
import type { CashEntryInput } from "@/lib/cash-book";
import type { SupplierPaymentInput } from "@/lib/bill-posting";
import { PageHeader } from "@/components/page-header";
import { requireWrite } from "@/lib/screen-guard";
import { ReceiptForm } from "@/app/receipts/new/receipt-form";
import { VoucherForm } from "@/app/cash-book/new/voucher-form";
import { PayForm } from "@/app/bills/pay/pay-form";

export const dynamic = "force-dynamic";

/** Corrects a draft in the same form it was keyed in, before it is posted. */
export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireWrite("drafts", `/drafts/${id}`);
  const draft = await db.draft.findUnique({ where: { id } });
  if (!draft) notFound();

  let form: React.ReactNode;
  if (draft.kind === "receipt") {
    const p = draft.payload as unknown as ReceiptInput;
    const residents = await db.resident.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
      orderBy: { unitAddress: "asc" },
      select: { id: true, unitAddress: true, ownerName: true },
    });
    const open = (await residentOutstanding(p.residentId)).filter((c) => c.open.gt(0)).map((c) => ({
      id: c.id, description: c.description, periodMonth: c.periodMonth, periodYear: c.periodYear, open: c.open.toFixed(2),
    }));
    form = <ReceiptForm residents={residents} defaultResidentId={p.residentId} initialOpen={open} suggestedReceiptNo={draft.number} draftId={id} initial={p} />;
  } else if (draft.kind === "cashEntry") {
    const p = draft.payload as unknown as CashEntryInput;
    const accounts = await db.account.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true, type: p.direction === "IN" ? "INCOME" : "EXPENSE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
    form = <VoucherForm direction={p.direction} accounts={accounts} suggestedRefNo={draft.number} draftId={id} initial={p} />;
  } else {
    const p = draft.payload as unknown as SupplierPaymentInput;
    const bills = await db.bill.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: [{ date: "asc" }, { invoiceNo: "asc" }],
      include: { supplier: { select: { id: true, name: true } } },
    });
    const suppliers = [...new Map(bills.map((b) => [b.supplier.id, b.supplier])).values()];
    form = (
      <PayForm
        suppliers={suppliers}
        bills={bills.map((b) => ({ id: b.id, supplierId: b.supplierId, invoiceNo: b.invoiceNo, date: b.date.toISOString().slice(0, 10), open: (Number(b.amount) - Number(b.paid)).toFixed(2) }))}
        defaultSupplierId={p.supplierId}
        suggestedVoucherNo={draft.number}
        draftId={id}
        initial={p}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit draft ${draft.number}`} description="Correct the entry, then save. It stays a draft until it is posted." />
      {form}
    </div>
  );
}
