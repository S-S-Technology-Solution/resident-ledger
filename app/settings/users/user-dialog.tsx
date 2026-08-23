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

type User = { id: string; name: string; email: string; role: UserRole };

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "ADMIN", label: "Administrator", hint: "Everything, including users, settings and year-end" },
  { value: "TREASURER", label: "Treasurer", hint: "Day-to-day posting, but not settings or year-end" },
  { value: "VIEWER", label: "View only", hint: "Reports and listings, no posting" },
];

export function UserDialog({ mode, user }: { mode: "create" | "edit"; user?: User }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "TREASURER");
  const [password, setPassword] = useState("");

  const selected = ROLES.find((r) => r.value === role);

  function submit() {
    start(async () => {
      try {
        await upsertUser({ id: user?.id, name, email, role, password: password || "" });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${user?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
            disabled={pending || !name || !email || (mode === "create" && password.length < 8)}
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
            await setUserActive(id, !active);
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
