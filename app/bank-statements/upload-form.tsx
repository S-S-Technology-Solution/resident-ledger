"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { uploadStatement } from "./actions";

export function UploadForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(uploadStatement, null);

  useEffect(() => {
    if (state?.ok && state.data) {
      toast.success("Statement read and saved");
      router.push(`/bank-statements/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={action} className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="statement-file">RHB statement (PDF)</Label>
          <Input id="statement-file" name="file" type="file" accept="application/pdf,.pdf" className="w-80" required />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Reading statement…" : "Upload statement"}</Button>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-rose-700">{state.error}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Upload statements in order, one month at a time. Each is checked line by line against its
        running balance, and must open where the previous one closed.
      </p>
    </form>
  );
}
