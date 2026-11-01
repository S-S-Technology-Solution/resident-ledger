"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.set("login", login);
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
        <Label htmlFor="login">Phone number or email</Label>
        <Input id="login" type="text" autoComplete="username" required placeholder="e.g. 012-3021143"
          value={login} onChange={(e) => setLogin(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !login || !password} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
