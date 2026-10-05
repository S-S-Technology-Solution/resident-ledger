"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { unwrap } from "@/lib/action";
import { postDrafts } from "./actions";
import { draftKindLabel } from "@/lib/draft-labels";

export type DraftRow = {
  id: string; kind: string; direction: string | null; number: string; date: string; party: string; amount: number; keyedBy: string;
};


export function DraftList({ drafts, canPost }: { drafts: DraftRow[]; canPost: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const all = picked.size === drafts.length;
  const total = drafts.filter((d) => picked.has(d.id)).reduce((s, d) => s + d.amount, 0);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function post() {
    start(async () => {
      try {
        const res = await unwrap(postDrafts([...picked]));
        if (res.posted.length) toast.success(`${res.posted.length} posted: ${res.posted.map((p) => p.number).join(", ")}`);
        for (const f of res.failed) toast.error(`${f.number} not posted — ${f.error}`);
        setPicked(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to post");
      }
    });
  }

  return (
    <div>
      {canPost && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {picked.size ? `${picked.size} selected · RM ${fmtRM(total)}` : "Tick the drafts you have checked"}
          </span>
          <Button disabled={pending || picked.size === 0} onClick={post}>
            {pending ? "Posting…" : `Post ${picked.size || ""} selected`.replace("  ", " ")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {canPost && (
              <TableHead className="w-10">
                <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setPicked(all ? new Set() : new Set(drafts.map((d) => d.id)))} />
              </TableHead>
            )}
            <TableHead className="w-28">Date</TableHead>
            <TableHead className="w-28">Number</TableHead>
            <TableHead className="w-40">Type</TableHead>
            <TableHead>From / to</TableHead>
            <TableHead className="w-32 text-right">Amount</TableHead>
            <TableHead className="w-32">Keyed by</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((d) => (
            <TableRow key={d.id} className={picked.has(d.id) ? "bg-emerald-50/50" : ""}>
              {canPost && (
                <TableCell><input type="checkbox" aria-label={`Select ${d.number}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} /></TableCell>
              )}
              <TableCell>{d.date}</TableCell>
              <TableCell className="font-mono">{d.number}</TableCell>
              <TableCell><Badge variant="outline">{draftKindLabel(d)}</Badge></TableCell>
              <TableCell className="whitespace-normal">{d.party}</TableCell>
              <TableCell className="text-right font-mono tabular">{fmtRM(d.amount)}</TableCell>
              <TableCell className="text-muted-foreground">{d.keyedBy}</TableCell>
              <TableCell><Link href={`/drafts/${d.id}`} className="text-sm underline">Check</Link></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
