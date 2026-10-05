"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { unwrap } from "@/lib/action";
import { deleteDraft, postDrafts } from "../actions";

export function DraftActions({ id, number }: { id: string; number: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button variant="outline" asChild><Link href={`/drafts/${id}/edit`}>Edit</Link></Button>
      <ConfirmButton
        label="Delete"
        destructive
        title={`Delete draft ${number}?`}
        description="It was never posted, so nothing in the accounts changes. Its number becomes free to use again."
        confirmLabel="Delete draft"
        onConfirm={async () => { await unwrap(deleteDraft(id)); toast.success(`Draft ${number} deleted`); router.push("/drafts"); }}
      />
      <Button disabled={pending} onClick={() => start(async () => {
        try {
          const res = await unwrap(postDrafts([id]));
          if (res.failed.length) { toast.error(`${number} not posted — ${res.failed[0].error}`); return; }
          toast.success(`${number} posted`);
          router.push(res.posted[0]?.href ?? "/drafts");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to post");
        }
      })}>{pending ? "Posting…" : "Post to accounts"}</Button>
    </div>
  );
}
