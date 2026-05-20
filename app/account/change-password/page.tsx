import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Change password"
        description={user.email}
        actions={
          <Button asChild variant="outline">
            <Link href="/">Cancel</Link>
          </Button>
        }
      />
      <div className="max-w-md rounded-xl border bg-card p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
