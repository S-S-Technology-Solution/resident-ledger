"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function DateRange({ mode = "range" }: { mode?: "range" | "asOf" }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function apply() {
    // Keep the page's other filters (account, kind, view…); only the dates change. Back to page 1.
    const q = new URLSearchParams(sp.toString());
    q.delete("page");
    if (mode === "range" && from) q.set("from", from); else q.delete("from");
    if (to) q.set("to", to); else q.delete("to");
    router.push(`${path}?${q.toString()}`);
  }

  return (
    <div className="flex items-end gap-3 print:hidden">
      {mode === "range" && (
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      )}
      <div className="space-y-1">
        <Label>{mode === "asOf" ? "As at" : "To"}</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button onClick={apply}>Apply</Button>
    </div>
  );
}
