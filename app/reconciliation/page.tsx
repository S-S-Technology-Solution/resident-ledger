import { redirect } from "next/navigation";
import { requireScreen } from "@/lib/screen-guard";

// Bank reconciliation now runs from uploaded statements, where each line is
// paired with its book entry. This address is kept so old links still land.
export default async function ReconciliationPage() {
  await requireScreen("bank-statements");
  redirect("/bank-statements");
}
