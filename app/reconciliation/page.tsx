import { redirect } from "next/navigation";

// Bank reconciliation now runs from uploaded statements, where each line is
// paired with its book entry. This address is kept so old links still land.
export default function ReconciliationPage() {
  redirect("/bank-statements");
}
