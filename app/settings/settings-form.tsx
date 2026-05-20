"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { saveSettings } from "./actions";

type Initial = {
  name: string;
  registrationNo: string;
  address: string;
  currency: string;
  fiscalYearStart: number;
  lockedThrough: string;
};

const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December",
];

export function SettingsForm({ initial }: { initial: Initial }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [registrationNo, setReg] = useState(initial.registrationNo);
  const [address, setAddress] = useState(initial.address);
  const [currency, setCurrency] = useState(initial.currency);
  const [fy, setFy] = useState(initial.fiscalYearStart);
  const [lockedThrough, setLocked] = useState(initial.lockedThrough);

  function save() {
    start(async () => {
      try {
        await saveSettings({
          name, registrationNo, address, currency,
          fiscalYearStart: fy, lockedThrough: lockedThrough || undefined,
        });
        toast.success("Settings saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Association details</CardTitle>
          <p className="text-sm text-muted-foreground">Shown on the receipt letterhead and report headers.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Association name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="regNo">Registration #</Label>
              <Input id="regNo" value={registrationNo} onChange={(e) => setReg(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <textarea
              id="address"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Used on receipt letterhead"
            />
          </div>
          <div className="space-y-1">
            <Label>Fiscal year starts</Label>
            <Select value={String(fy)} onValueChange={(v) => setFy(parseInt(v, 10))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Period locking</CardTitle>
          <p className="text-sm text-muted-foreground">Restrict posting before a given date once a period is closed.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label htmlFor="locked">Books locked through</Label>
            <Input id="locked" type="date" value={lockedThrough} onChange={(e) => setLocked(e.target.value)} />
            <p className="text-xs text-muted-foreground">Optional — not enforced yet; the value is stored for upcoming guards.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={pending || !name} onClick={save}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
