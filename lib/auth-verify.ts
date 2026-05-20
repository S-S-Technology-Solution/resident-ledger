// Edge-safe (no `server-only`, no `next/headers`). Used by middleware.

const enc = new TextEncoder();
const dec = new TextDecoder();

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

export type Session = { userId: string; exp: number };

export async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body, secret);
  if (expected.length !== sig.length) return null;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const decoded = JSON.parse(dec.decode(fromB64url(body))) as Session;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "rl_session";
