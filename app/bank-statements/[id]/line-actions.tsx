"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ComboOption } from "@/components/ui/combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getGroupOptions, markLineNoEntry, matchStatementLine, matchStatementLines, unmatchStatementLine,
} from "../actions";
import { fmtRM } from "@/lib/money";

export type Candidate = { kind: "receipt" | "billPayment" | "cashEntry" | "refund" | "bf"; id: string; ref: string; label: string; date: string; refAgrees: boolean };
export type Account = { id: string; code: string; name: string; type: string };

export type LineView = {
  id: string;
  ref: string;
  isIn: boolean;
  amount: number;
  type: string;
  matched: { ref: string; label: string; href: string } | null;
  // Other lines or entries matched together with this one.
  together: string | null;
  // An unposted draft for the same money: it can be matched once posted.
  draft: { id: string; number: string; party: string } | null;
  noEntry: string | null;
  candidates: Candidate[];
  guess: { residentId: string; how: "address" | "name" } | null;
  isCharge: boolean;
};

type Result = { ok: true } | { ok: false; error: string };

function useAction() {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<Result>, success?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { if (success) toast.success(success); after?.(); }
      else toast.error(r.error);
    });
  return { pending, act };
}

export function LineActions({
  line, residents, locked,
}: {
  line: LineView;
  residents: ComboOption[];
  locked: boolean;
}) {
  const { pending, act } = useAction();
  const [dialog, setDialog] = useState<null | "none" | "group">(null);

  if (line.matched || line.noEntry) {
    return (
      <div className="flex items-center justify-between gap-2">
        {line.matched ? (
          <div className="text-sm">
            <Link href={line.matched.href}>
              <span className="font-mono text-xs underline">{line.matched.ref}</span>{" "}
              <span className="text-muted-foreground">{line.matched.label}</span>
            </Link>
            {line.together && <div className="text-xs text-muted-foreground">{line.together}</div>}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No entry — {line.noEntry}</span>
        )}
        {!locked && (
          <Button size="sm" variant="ghost" disabled={pending}
            onClick={() => act(() => unmatchStatementLine(line.id), "Unmatched")}>
            Undo
          </Button>
        )}
      </div>
    );
  }

  if (locked) return <span className="text-sm text-rose-700">Unmatched</span>;

  const best = line.candidates[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {best && (
        <Button size="sm" variant="outline" disabled={pending}
          title={`${best.label}, ${best.date}`}
          onClick={() => act(() => matchStatementLine(line.id, best.kind, best.id), `Matched to ${best.ref}`)}>
          Match {best.ref}{best.refAgrees ? " ✓" : ""}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={best ? "ghost" : "outline"} disabled={pending}>More…</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {line.candidates.slice(1).map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => act(() => matchStatementLine(line.id, c.kind, c.id), `Matched to ${c.ref}`)}>
              Match {c.ref} — {c.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setDialog("group")}>Match several…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("none")}>No entry needed…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!best && line.draft && (
        <span className="text-xs text-amber-700">
          Draft <Link className="underline font-mono" href={`/drafts/${line.draft.id}`}>{line.draft.number}</Link> ({line.draft.party}) is
          this amount but not posted yet — post it, then match it here
        </span>
      )}
      {!best && !line.draft && (
        <span className="text-xs text-muted-foreground">
          {line.isIn
            ? line.guess
              ? `Not keyed yet — ${line.guess.how === "address" ? "address" : "name"} suggests ${residents.find((r) => r.value === line.guess!.residentId)?.label}`
              : "Not keyed yet — key the receipt, then match it here"
            : "Not keyed yet — key the payment voucher or cash book entry, then match it here"}
        </span>
      )}

      {dialog === "none" && <NoEntryDialog line={line} onClose={() => setDialog(null)} />}
      {dialog === "group" && <GroupDialog line={line} onClose={() => setDialog(null)} />}
    </div>
  );
}

function NoEntryDialog({ line, onClose }: { line: LineView; onClose: () => void }) {
  const { pending, act } = useAction();
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>No book entry for {line.ref}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use this only for a line the books should not record, such as a bounced cheque that was
            presented again. It stays on the reconciliation as a bank item not in the books.
          </p>
          <div className="space-y-1">
            <Label htmlFor="no-entry-note">Reason</Label>
            <Input id="no-entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cheque 936 returned, re-presented 19 Jan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !note.trim()} onClick={() => act(() => markLineNoEntry(line.id, note), "Marked", onClose)}>
            {pending ? "Saving…" : "Mark"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Options = {
  lines: { id: string; ref: string; date: string; amount: number; label: string }[];
  items: { kind: Candidate["kind"]; id: string; ref: string; label: string; date: string; amount: number }[];
};

/**
 * Matches by totals: tick the book entries that make up this line (one deposit
 * of several receipts), or one entry plus the other lines it was split into.
 */
function GroupDialog({ line, onClose }: { line: LineView; onClose: () => void }) {
  const { pending, act } = useAction();
  const [opts, setOpts] = useState<Options | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    getGroupOptions(line.id).then((r) => {
      if (r.ok && r.data) setOpts(r.data);
      else { toast.error(r.ok ? "Nothing to show" : r.error); close.current(); }
    });
  }, [line.id]);

  const toggle = (xs: string[], set: (v: string[]) => void, k: string) => set(xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]);
  const key = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;
  const lineTotal = line.amount + (opts?.lines.filter((l) => lines.includes(l.id)).reduce((s, l) => s + l.amount, 0) ?? 0);
  const itemTotal = opts?.items.filter((i) => items.includes(key(i))).reduce((s, i) => s + i.amount, 0) ?? 0;
  const both = lines.length > 0 && items.length > 1;
  const ok = items.length > 0 && !both && Math.abs(lineTotal - itemTotal) < 0.005;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Match {line.ref} by total</DialogTitle></DialogHeader>
        {!opts ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <div className="mb-1 font-medium">Book entries</div>
              <div className="max-h-80 overflow-y-auto rounded border divide-y">
                {opts.items.map((i) => (
                  <label key={key(i)} className="flex cursor-pointer items-start gap-2 px-2 py-1.5 hover:bg-muted/50">
                    <input type="checkbox" className="mt-1" checked={items.includes(key(i))} onChange={() => toggle(items, setItems, key(i))} />
                    <span className="flex-1"><span className="font-mono text-xs">{i.ref}</span> <span className="text-muted-foreground">{i.date} · {i.label}</span></span>
                    <span className="font-mono tabular">{fmtRM(i.amount)}</span>
                  </label>
                ))}
                {opts.items.length === 0 && <p className="p-2 text-muted-foreground">No unmatched entries near this date.</p>}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">Statement lines</div>
              <div className="max-h-80 overflow-y-auto rounded border divide-y">
                <div className="flex items-start gap-2 bg-muted/40 px-2 py-1.5">
                  <input type="checkbox" className="mt-1" checked disabled />
                  <span className="flex-1 font-mono text-xs">{line.ref} <span className="font-sans text-muted-foreground">{line.type}</span></span>
                  <span className="font-mono tabular">{fmtRM(line.amount)}</span>
                </div>
                {opts.lines.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-start gap-2 px-2 py-1.5 hover:bg-muted/50">
                    <input type="checkbox" className="mt-1" checked={lines.includes(l.id)} onChange={() => toggle(lines, setLines, l.id)} />
                    <span className="flex-1"><span className="font-mono text-xs">{l.ref}</span> <span className="text-muted-foreground">{l.date} · {l.label}</span></span>
                    <span className="font-mono tabular">{fmtRM(l.amount)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className={`text-sm ${ok ? "text-emerald-700" : "text-muted-foreground"}`}>
          Lines RM {fmtRM(lineTotal)} · entries RM {fmtRM(itemTotal)}
          {both ? " — pick one entry for several lines, or several entries for one line" : ok ? " — totals agree" : ""}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !ok} onClick={() => act(
            () => matchStatementLines([line.id, ...lines], opts!.items.filter((i) => items.includes(key(i))).map((i) => ({ kind: i.kind, id: i.id }))),
            "Matched", onClose,
          )}>
            {pending ? "Matching…" : "Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
