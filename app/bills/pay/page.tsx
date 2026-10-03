import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { nextNumber } from "@/lib/numbering";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireWrite } from "@/lib/screen-guard";
import { PayForm } from "./pay-form";

export const dynamic = "force-dynamic";

export default async function PaySupplierPage({ searchParams }: { searchParams: Promise<{ supplierId?: string; billId?: string }> }) {
  await requireWrite("bills", "/bills");
  const { supplierId, billId } = await searchParams;
  const bills = await db.bill.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, status: { in: ["UNPAID", "PARTIAL"] } },
    orderBy: [{ date: "asc" }, { invoiceNo: "asc" }],
    include: { supplier: { select: { id: true, name: true } } },
  });
  const suppliers = [...new Map(bills.map((b) => [b.supplier.id, b.supplier])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pay supplier"
        description="One payment voucher and cheque can settle several of the supplier's bills."
        actions={<Button asChild variant="outline"><Link href="/bills">Cancel</Link></Button>}
      />
      <PayForm
        suppliers={suppliers}
        bills={bills.map((b) => ({
          id: b.id, supplierId: b.supplierId, invoiceNo: b.invoiceNo, date: b.date.toISOString().slice(0, 10),
          open: (Number(b.amount) - Number(b.paid)).toFixed(2),
        }))}
        defaultSupplierId={supplierId ?? bills.find((b) => b.id === billId)?.supplierId ?? ""}
        defaultBillId={billId}
        suggestedVoucherNo={await nextNumber("CASH_OUT", new Date())}
      />
    </div>
  );
}
