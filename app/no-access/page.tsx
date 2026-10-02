import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { SCREENS, homeFor } from "@/lib/screens";
import { currentUser } from "@/lib/screen-guard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { screen } = await searchParams;
  const label = SCREENS.find((s) => s.key === screen)?.label;
  return (
    <Empty
      icon={ShieldOff}
      title={label ? `You don't have access to ${label}` : "You don't have access to that screen"}
      description="Ask an administrator to add it to your account under Settings › Users."
      action={<Button asChild variant="outline"><Link href={homeFor(user)}>Go to my first screen</Link></Button>}
    />
  );
}
