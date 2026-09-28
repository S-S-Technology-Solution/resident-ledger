"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import {
  cashEntryFromLine, markLineNoEntry, matchStatementLine, receiptFromLine, unmatchStatementLine,
} from "../actions";

export type Candidate = { kind: "receipt" | "billPayment" | "cashEntry"; id: string; ref: string; label: string; date: string; refAgrees: boolean };
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
  line, residents, accounts, locked, bankChargesAccountId,
}: {
  line: LineView;
  residents: ComboOption[];
  accounts: Account[];
  locked: boolean;
  bankChargesAccountId: string | null;
}) {
  const { pending, act } = useAction();
  const [dialog, setDialog] = useState<null | "receipt" | "cash" | "none">(null);

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
          <Button size="sm" variant={best ? "ghost" : "outline"} disabled={pending}>Enter as…</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {line.candidates.slice(1).map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => act(() => matchStatementLine(line.id, c.kind, c.id), `Matched to ${c.ref}`)}>
              Match {c.ref} — {c.label}
            </DropdownMenuItem>
          ))}
          {line.isIn && <DropdownMenuItem onSelect={() => setDialog("receipt")}>Resident receipt…</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setDialog("cash")}>{line.isIn ? "Cash book receipt…" : "Cash book payment…"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("none")}>No entry needed…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {line.guess && line.isIn && (
        <span className="text-xs text-muted-foreground">
          {line.guess.how === "address" ? "Address" : "Name"} suggests {residents.find((r) => r.value === line.guess!.residentId)?.label}
        </span>
      )}

      {dialog === "receipt" && (
        <ReceiptDialog line={line} residents={residents} onClose={() => setDialog(null)} />
      )}
      {dialog === "cash" && (
        <CashDialog line={line} accounts={accounts} bankChargesAccountId={bankChargesAccountId} onClose={() => setDialog(null)} />
      )}
      {dialog === "none" && <NoEntryDialog line={line} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ReceiptDialog({ line, residents, onClose }: { line: LineView; residents: ComboOption[]; onClose: () => void }) {
  const { pending, act } = useAction();
  const [residentId, setResidentId] = useState(line.guess?.residentId ?? "");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resident receipt — {fmtRM(line.amount)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Takes the payment on the statement date with the next receipt number, sets it against the
            resident&rsquo;s oldest unpaid charges, and pairs it with line {line.ref}.
          </p>
          <div className="space-y-1">
            <Label>Resident</Label>
            <Combobox options={residents} value={residentId} onChange={setResidentId} placeholder="Search by address, code or owner" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !residentId}
            onClick={() => act(() => receiptFromLine({ lineId: line.id, residentId }), "Receipt saved and matched", onClose)}>
            {pending ? "Saving…" : "Save receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashDialog({ line, accounts, bankChargesAccountId, onClose }: {
  line: LineView; accounts: Account[]; bankChargesAccountId: string | null; onClose: () => void;
}) {
  const { pending, act } = useAction();
  const relevant = accounts.filter((a) => (line.isIn ? a.type === "INCOME" : a.type === "EXPENSE"));
  const [accountId, setAccountId] = useState(line.isCharge && bankChargesAccountId ? bankChargesAccountId : "");
  const [description, setDescription] = useState(line.isCharge ? `Bank charge — ${line.type}` : "");
  const [counterparty, setCounterparty] = useState(line.isCharge ? "RHB Bank" : "");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line.isIn ? "Cash book receipt" : "Cash book payment"} — {fmtRM(line.amount)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{line.isIn ? "Income account" : "Expense account"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
              <SelectContent>
                {relevant.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-desc">Description</Label>
            <Input id="cash-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. TNB electricity, June" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-party">{line.isIn ? "Received from" : "Paid to"}</Label>
            <Input id="cash-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !accountId || !description}
            onClick={() => act(() => cashEntryFromLine({ lineId: line.id, accountId, description, counterparty: counterparty || undefined }), "Entered and matched", onClose)}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
