/**
 * What a server action returns, and the client-side helper that reads it.
 *
 * Next.js replaces the message of an error thrown from a server action with a
 * generic one in production, so a reason like "Void the receipt first" never
 * reaches the person who needs it. Actions therefore return failures as values
 * (see lib/action-server.ts), and `unwrap` turns one back into a thrown Error
 * in the browser — existing `catch (e) { toast.error(e.message) }` code keeps
 * working, now with the real message.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function unwrap<T>(result: Promise<ActionResult<T>> | ActionResult<T>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
