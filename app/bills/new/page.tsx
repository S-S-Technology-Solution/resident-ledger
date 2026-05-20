import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BillForm } from "./bill-form";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const [suppliers, expenseAccounts] = await Promise.all([
    db.supplier.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.account.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true, type: "EXPENSE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Bill"
        actions={
          <Button asChild variant="outline">
            <Link href="/bills">Cancel</Link>
          </Button>
        }
      />
      <BillForm suppliers={suppliers} expenseAccounts={expenseAccounts} />
    </div>
  );
}
