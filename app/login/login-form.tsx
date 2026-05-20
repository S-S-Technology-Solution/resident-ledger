"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      if (next) fd.set("next", next);
      const res = await loginAction(fd);
      if (res && "error" in res) toast.error(res.error);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !email || !password} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
