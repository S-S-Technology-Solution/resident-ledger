"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { createBill } from "../actions";

export function BillForm({
  suppliers,
  expenseAccounts,
}: {
  suppliers: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoice] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseAccountId, setExpense] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Supplier</Label>
          <Combobox
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Search supplier…"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Invoice #</Label>
          <Input value={invoiceNo} onChange={(e) => setInvoice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Due date (optional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Amount (RM)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Expense category</Label>
          <Combobox
            value={expenseAccountId}
            onChange={setExpense}
            placeholder="Search expense category…"
            options={expenseAccounts.map((a) => ({ value: a.id, label: a.name, hint: a.code }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description (optional)</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending || !supplierId || !invoiceNo || !amount || !expenseAccountId}
          onClick={() => start(async () => {
            try {
              const b = await createBill({
                supplierId, invoiceNo, date, dueDate: dueDate || undefined,
                amount, expenseAccountId, description: description || undefined,
              });
              toast.success("Bill recorded");
              router.push(`/bills/${b.id}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}
        >{pending ? "Saving…" : "Save bill"}</Button>
      </div>
    </div>
  );
}
