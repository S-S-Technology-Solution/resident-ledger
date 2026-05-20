import "server-only";
import { cookies } from "next/headers";

const COOKIE = "rl_session";
const MAX_AGE = 60 * 60 * 24 * 14;       // 14 days
const enc = new TextEncoder();
const dec = new TextDecoder();

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (≥16 chars)");
  return s;
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

export type Session = { userId: string; exp: number };

export async function signSession(userId: string): Promise<string> {
  const payload: Session = { userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  // constant-time compare
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

export async function setSessionCookie(userId: string) {
  const token = await signSession(userId);
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function currentSession(): Promise<Session | null> {
  const c = await cookies();
  return verifySession(c.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
