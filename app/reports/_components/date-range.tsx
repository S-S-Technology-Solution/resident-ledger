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
    const q = new URLSearchParams();
    if (mode === "range" && from) q.set("from", from);
    if (to) q.set("to", to);
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
        <Label>{mode === "asOf" ? "As of" : "To"}</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button onClick={apply}>Apply</Button>
    </div>
  );
}
