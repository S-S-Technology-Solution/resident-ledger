"use client";

import { useState, useTransition } from "react";
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
  markLineNoEntry, matchStatementLine, unmatchStatementLine,
} from "../actions";

export type Candidate = { kind: "receipt" | "billPayment" | "cashEntry" | "refund"; id: string; ref: string; label: string; date: string; refAgrees: boolean };
export type Account = { id: string; code: string; name: string; type: string };

export type LineView = {
  id: string;
  ref: string;
  isIn: boolean;
  amount: number;
  type: string;
  matched: { ref: string; label: string; href: string } | null;
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
  const [dialog, setDialog] = useState<null | "none">(null);

  if (line.matched || line.noEntry) {
    return (
      <div className="flex items-center justify-between gap-2">
        {line.matched ? (
          <Link href={line.matched.href} className="text-sm">
            <span className="font-mono text-xs underline">{line.matched.ref}</span>{" "}
            <span className="text-muted-foreground">{line.matched.label}</span>
          </Link>
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
          <DropdownMenuItem onSelect={() => setDialog("none")}>No entry needed…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!best && (
        <span className="text-xs text-muted-foreground">
          {line.isIn
            ? line.guess
              ? `Not keyed yet — ${line.guess.how === "address" ? "address" : "name"} suggests ${residents.find((r) => r.value === line.guess!.residentId)?.label}`
              : "Not keyed yet — key the receipt, then match it here"
            : "Not keyed yet — key the payment voucher or cash book entry, then match it here"}
        </span>
      )}

      {dialog === "none" && <NoEntryDialog line={line} onClose={() => setDialog(null)} />}
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
