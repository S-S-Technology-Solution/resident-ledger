"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { createCharge } from "../actions";

type ResidentOpt = { id: string; unitAddress: string; ownerName: string; monthlyFee: string };

export function ChargeForm({ residents, defaultResidentId }: { residents: ResidentOpt[]; defaultResidentId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date();
  const [residentId, setResidentId] = useState(defaultResidentId ?? "");
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [periodMonth, setMonth] = useState(today.getMonth() + 1);
  const [periodYear, setYear] = useState(today.getFullYear());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const resident = residents.find((r) => r.id === residentId);
  function applyDefaults() {
    if (!resident) return;
    setAmount(resident.monthlyFee);
    setDescription(`Monthly fee — ${periodYear}-${String(periodMonth).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-1">
        <Label>Resident</Label>
        <Combobox
          value={residentId}
          onChange={setResidentId}
          placeholder="Search resident…"
          options={residents.map((r) => ({ value: r.id, label: r.unitAddress, hint: r.ownerName }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Period month</Label>
          <Input type="number" min={1} max={12} value={periodMonth} onChange={(e) => setMonth(parseInt(e.target.value || "1", 10))} />
        </div>
        <div className="space-y-1">
          <Label>Period year</Label>
          <Input type="number" min={2000} max={2100} value={periodYear} onChange={(e) => setYear(parseInt(e.target.value || "2025", 10))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Amount (RM)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex sm:items-end">
          <Button type="button" variant="outline" onClick={applyDefaults} disabled={!resident} className="w-full sm:w-auto">
            Use monthly fee
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          disabled={pending || !residentId || !amount || !description}
          onClick={() => start(async () => {
            try {
              await createCharge({ residentId, date, periodMonth, periodYear, amount, description });
              toast.success("Charge created");
              router.push(`/residents/${residentId}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}
        >{pending ? "Saving…" : "Create charge"}</Button>
      </div>
    </div>
  );
}
