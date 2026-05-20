import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChargeForm } from "./charge-form";

export const dynamic = "force-dynamic";

export default async function NewChargePage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string }>;
}) {
  const { residentId } = await searchParams;
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
    orderBy: { unitAddress: "asc" },
    select: { id: true, unitAddress: true, ownerName: true, monthlyFee: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Charge"
        actions={
          <Button asChild variant="outline">
            <Link href="/charges">Cancel</Link>
          </Button>
        }
      />
      <ChargeForm
        residents={residents.map((r) => ({ ...r, monthlyFee: r.monthlyFee.toString() }))}
        defaultResidentId={residentId}
      />
    </div>
  );
}
