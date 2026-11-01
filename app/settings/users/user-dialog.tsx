"use client";

import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { upsertUser, setUserActive } from "./actions";
import { unwrap } from "@/lib/action";
import { REPORTS, SCREENS, reportScreen } from "@/lib/screens";
import { fmtPhone } from "@/lib/phone";

type User = { id: string; name: string; phone: string | null; email: string | null; role: UserRole; allScreens: boolean; screens: string[] };

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "ADMIN", label: "Administrator", hint: "Everything, including users, settings and year-end" },
  { value: "TREASURER", label: "Treasurer", hint: "Day-to-day posting, but not settings or year-end" },
  { value: "VIEWER", label: "View only", hint: "Reports and listings, no posting" },
];

export function UserDialog({ mode, user }: { mode: "create" | "edit"; user?: User }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ? fmtPhone(user.phone) : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "TREASURER");
  const [password, setPassword] = useState("");
  const [allScreens, setAllScreens] = useState(user?.allScreens ?? true);
  // Screen keys, plus "report:<key>" for each report ticked under Reports.
  const [screens, setScreens] = useState<string[]>(user?.screens ?? []);
  const toggleScreen = (k: string) =>
    setScreens((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const groups = [...new Set(SCREENS.map((s) => s.group))];
  const [someReports, setSomeReports] = useState((user?.screens ?? []).some((k) => k.startsWith("report:")));
  const reportGroups = [...new Set(REPORTS.map((r) => r.group))];
  const pickedReports = screens.filter((k) => k.startsWith("report:"));
  const pickedScreens = screens.filter((k) => !k.startsWith("report:"));

  const selected = ROLES.find((r) => r.value === role);

  function submit() {
    start(async () => {
      try {
        const sent = someReports ? screens : pickedScreens;
        await unwrap(upsertUser({ id: user?.id, name, phone, email, role, password: password || "", allScreens, screens: sent }));
        toast.success(mode === "create" ? "User added" : "User updated");
        setOpen(false);
        setPassword("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>Add user</Button>
        ) : (
          <Button size="sm" variant="outline">Edit</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${user?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="u-phone">Phone number</Label>
              <Input id="u-phone" type="tel" placeholder="012-3456789" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">They sign in with either one.</p>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && <p className="text-xs text-muted-foreground">{selected.hint}</p>}
          </div>
          {role !== "ADMIN" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Screens</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="u-scope" checked={allScreens} onChange={() => setAllScreens(true)} />
                  All screens
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="u-scope" checked={!allScreens} onChange={() => setAllScreens(false)} />
                  Only the screens ticked below
                </label>
              </div>
              {!allScreens && (
                <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto rounded-md border p-3">
                  {groups.map((g) => (
                    <div key={g} className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
                      {SCREENS.filter((s) => s.group === g).map((s) => (
                        <label key={s.key} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={screens.includes(s.key)} onChange={() => toggleScreen(s.key)} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {!allScreens && screens.includes("reports") && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="text-sm font-medium">Reports</div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="u-reports" checked={!someReports} onChange={() => setSomeReports(false)} />
                      All reports
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="u-reports" checked={someReports} onChange={() => setSomeReports(true)} />
                      Only these reports
                    </label>
                  </div>
                  {someReports && (
                    <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto">
                      {reportGroups.map((g) => (
                        <div key={g} className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
                          {REPORTS.filter((r) => r.group === g).map((r) => (
                            <label key={r.key} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={screens.includes(reportScreen(r.key))} onChange={() => toggleScreen(reportScreen(r.key))} />
                              {r.title}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {role === "VIEWER"
                  ? "A view-only user can open these screens but never change anything."
                  : "The role still decides what they can change on each screen."}
              </p>
            </fieldset>
          )}
          <div className="space-y-1">
            <Label htmlFor="u-pass">
              {mode === "create" ? "Password" : "New password (leave blank to keep the current one)"}
            </Label>
            <Input
              id="u-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "create" ? "At least 8 characters" : "Unchanged"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={
              pending || !name || (!phone && !email) || (mode === "create" && password.length < 8)
              || (role !== "ADMIN" && !allScreens && (pickedScreens.length === 0 || (screens.includes("reports") && someReports && pickedReports.length === 0)))
            }
            onClick={submit}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleUserButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await unwrap(setUserActive(id, !active));
            toast.success(active ? "User deactivated" : "User reactivated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        })
      }
    >
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
