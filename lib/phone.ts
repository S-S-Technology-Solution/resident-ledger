/**
 * Malaysian phone numbers as stored for sign-in: digits only, starting with 0.
 * "012-345 6789", "+60 12-3456789" and "60123456789" all become "0123456789".
 */
export function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("60") ? `0${digits.slice(2)}` : digits;
}

export const isValidPhone = (p: string) => /^0\d{8,10}$/.test(p);

/** "012-3456789" */
export const fmtPhone = (p: string) => (p.startsWith("01") ? `${p.slice(0, 3)}-${p.slice(3)}` : p);

/** What a user signs in with, for display: phone if they have one, else email. */
export const signInId = (u: { phone: string | null; email: string | null }) =>
  u.phone ? fmtPhone(u.phone) : (u.email ?? "");
