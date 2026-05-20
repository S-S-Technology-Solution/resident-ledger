"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "outline",
  size = "sm",
  destructive = false,
  onConfirm,
}: {
  label: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} disabled={pending}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => start(async () => {
              try {
                await onConfirm();
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}
          >{pending ? "Working…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
