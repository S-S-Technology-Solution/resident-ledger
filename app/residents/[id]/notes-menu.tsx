"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { unwrap } from "@/lib/action";
import { addCreditNote, addDebitNote, addRefund } from "../actions";

type Account = { id: string; code: string; name: string };
type Kind = "debit" | "credit" | "refund";

const COPY: Record<Kind, { title: string; help: string; accountLabel?: string; save: string }> = {
  debit: {
    title: "Debit note",
    help: "Adds a charge to this resident's account that isn't the monthly fee — e.g. a car sticker or a late-payment charge.",
    accountLabel: "Income account",
    save: "Save debit note",
  },
  credit: {
    title: "Credit note",
    help: "Reduces what this resident owes without any money changing hands — e.g. a fee waived or charged by mistake. It is set against their oldest unpaid charges.",
    accountLabel: "Account to reduce",
    save: "Save credit note",
  },
  refund: {
    title: "Refund",
    help: "Pays back money this resident has overpaid, by cheque or transfer with a payment voucher.",
    save: "Save refund",
  },
};

export function NotesMenu({
  residentId, accounts, feeAccountId, credit, suggestedVoucherNo,
}: { residentId: string; accounts: Account[]; feeAccountId: string; credit: number; suggestedVoucherNo: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline">Adjust…</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setKind("debit")}>Debit note…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setKind("credit")}>Credit note…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setKind("refund")} disabled={credit <= 0}>
            Refund…{credit > 0 ? ` (RM ${fmtRM(credit)} in credit)` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {kind && (
        <NoteDialog
          kind={kind} residentId={residentId} accounts={accounts} feeAccountId={feeAccountId}
          credit={credit} suggestedVoucherNo={suggestedVoucherNo} onClose={() => setKind(null)}
        />
      )}
    </>
  );
}

function NoteDialog({
  kind, residentId, accounts, feeAccountId, credit, suggestedVoucherNo, onClose,
}: {
  kind: Kind; residentId: string; accounts: Account[]; feeAccountId: string; credit: number;
  suggestedVoucherNo: string; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const copy = COPY[kind];
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(kind === "refund" && credit > 0 ? credit.toFixed(2) : "");
  const [accountId, setAccountId] = useState(feeAccountId);
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<"BANK" | "CASH">("BANK");
  const [voucherNo, setVoucherNo] = useState(suggestedVoucherNo);
  const [chequeNo, setChequeNo] = useState("");

  function save() {
    start(async () => {
      try {
        let message = "";
        if (kind === "debit") message = `Debit note ${(await unwrap(addDebitNote({ residentId, date, amount, accountId, description }))).noteNo} saved`;
        else if (kind === "credit") message = `Credit note ${(await unwrap(addCreditNote({ residentId, date, amount, accountId, description }))).noteNo} saved`;
        else message = `Refund ${(await unwrap(addRefund({ residentId, date, amount, method, voucherNo, chequeNo: chequeNo || undefined, description }))).voucherNo} saved`;
        toast.success(message);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{copy.help}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="n-date">Date</Label>
              <Input id="n-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="n-amt">Amount (RM)</Label>
              <Input id="n-amt" inputMode="decimal" className="text-right font-mono" value={amount}
                onChange={(e) => { if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value); }} />
            </div>
          </div>
          {copy.accountLabel && (
            <div className="space-y-1">
              <Label>{copy.accountLabel}</Label>
              <Combobox options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} value={accountId} onChange={setAccountId} />
            </div>
          )}
          {kind === "refund" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="n-pv">Voucher no.</Label>
                <Input id="n-pv" className="font-mono" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bank / Cash</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as "BANK" | "CASH")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="BANK">RHB Bank</SelectItem><SelectItem value="CASH">Cash</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="n-chq">Cheque no.</Label>
                <Input id="n-chq" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="n-desc">Reason</Label>
            <Input id="n-desc" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === "debit" ? "e.g. Car sticker 2026" : kind === "credit" ? "e.g. Fee charged twice for March" : "e.g. Overpaid security fees"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !amount || !description.trim() || (!!copy.accountLabel && !accountId)} onClick={save}>
            {pending ? "Saving…" : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
