import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { residentOutstanding } from "@/lib/ar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ReceiptForm } from "./receipt-form";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string }>;
}) {
  const { residentId } = await searchParams;
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
    orderBy: { unitAddress: "asc" },
    select: { id: true, unitAddress: true, ownerName: true },
  });
  const initialOpen = residentId
    ? (await residentOutstanding(residentId)).filter((c) => c.open.gt(0)).map((c) => ({
        id: c.id,
        description: c.description,
        periodMonth: c.periodMonth,
        periodYear: c.periodYear,
        open: c.open.toFixed(2),
      }))
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Receipt"
        actions={
          <Button asChild variant="outline">
            <Link href="/receipts">Cancel</Link>
          </Button>
        }
      />
      <ReceiptForm residents={residents} defaultResidentId={residentId} initialOpen={initialOpen} />
    </div>
  );
}
