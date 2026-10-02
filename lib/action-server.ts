import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "./action";

/**
 * Runs an action's body and returns its outcome as a value (see lib/action.ts).
 *
 * Errors the app raises itself (`throw new Error("…")`) are written for the
 * user and pass through as they are; validation failures give their first
 * message. Anything else — a database fault, a bug — is logged on the server and
 * the user is told only that it failed, so internals never leak. Next.js's own
 * redirect and not-found signals are re-thrown untouched.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: userMessage(e) };
  }
}

function userMessage(e: unknown) {
  if (e instanceof ZodError) return e.issues[0]?.message || "Some of the details are missing or not valid.";
  if (e instanceof Error && e.constructor === Error) return e.message;
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2002") {
    console.error(e);
    return "That number or code is already in use — refresh and try again.";
  }
  console.error(e);
  return "Something went wrong and nothing was saved. Try again, and tell an administrator if it keeps happening.";
}
