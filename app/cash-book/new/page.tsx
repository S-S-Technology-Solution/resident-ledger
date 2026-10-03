import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireWrite } from "@/lib/screen-guard";
import { nextCashRefNo } from "@/lib/cash-book";
import { VoucherForm } from "./voucher-form";

export const dynamic = "force-dynamic";

export default async function NewCashEntryPage({ searchParams }: { searchParams: Promise<{ direction?: string }> }) {
  await requireWrite("cash-book", "/cash-book");
  const direction = (await searchParams).direction === "IN" ? "IN" : "OUT";
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true, type: direction === "IN" ? "INCOME" : "EXPENSE" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title={direction === "IN" ? "New cash book receipt" : "New payment voucher"}
        description={direction === "IN"
          ? "Money received that is not from a resident — bank interest, a donation, a contribution."
          : "A payment with no supplier bill behind it. Key every voucher issued for the month, with its cheque number."}
        actions={<Button asChild variant="outline"><Link href="/cash-book">Cancel</Link></Button>}
      />
      <VoucherForm
        direction={direction}
        accounts={accounts}
        suggestedRefNo={await nextCashRefNo(direction, new Date())}
      />
    </div>
  );
}
