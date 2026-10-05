"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePosting } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { attempt } from "@/lib/action-server";
import { postDraft, saveDraft, type DraftPayload, type Posted } from "@/lib/drafts";

function refresh() {
  for (const p of ["/drafts", "/receipts", "/cash-book", "/bills", "/residents", "/bank-statements"]) revalidatePath(p);
}

/** Saves changes to a draft (the accountant's corrections, before posting). */
export async function updateDraft(id: string, payload: DraftPayload) {
  return attempt(async () => {
    const user = await requirePosting();
    const d = await saveDraft(payload, user.id, id);
    refresh();
    return { id: d.id, number: d.number };
  });
}

/**
 * Posts the chosen drafts one by one. Each succeeds or fails on its own — a
 * refused draft stays a draft with the reason — so one problem doesn't hold
 * back the rest.
 */
export async function postDrafts(ids: string[]) {
  return attempt(async () => {
    const user = await requirePosting();
    const posted: Posted[] = [];
    const failed: { number: string; error: string }[] = [];
    for (const id of ids) {
      const d = await db.draft.findUnique({ where: { id } });
      if (!d) continue;
      try {
        posted.push(await postDraft(id));
        await recordAudit("draft", id, "post", { after: { kind: d.kind, number: d.number, amount: d.amount.toString(), postedBy: user.email } });
      } catch (e) {
        failed.push({ number: d.number, error: e instanceof Error && e.constructor === Error ? e.message : "could not be posted" });
      }
    }
    refresh();
    return { posted, failed };
  });
}

export async function deleteDraft(id: string) {
  return attempt(async () => {
    await requirePosting();
    const d = await db.draft.findUnique({ where: { id } });
    if (!d) throw new Error("This draft has already been posted or deleted.");
    await db.draft.delete({ where: { id } });
    await recordAudit("draft", id, "delete", { before: { kind: d.kind, number: d.number, amount: d.amount.toString() } });
    refresh();
  });
}
