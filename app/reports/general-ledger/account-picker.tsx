"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";

export function AccountPicker({
  accounts,
  selected,
}: {
  accounts: { id: string; code: string; name: string }[];
  selected?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <div className="max-w-md">
      <Combobox
        value={selected ?? ""}
        onChange={(v) => {
          const q = new URLSearchParams(sp.toString());
          q.set("accountId", v);
          router.push(`${path}?${q.toString()}`);
        }}
        placeholder="Select account…"
        options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.code }))}
      />
    </div>
  );
}
