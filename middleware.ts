import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth-verify";

const PUBLIC_PREFIXES = ["/login", "/_next", "/favicon", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();   // fail-open in dev if not configured

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token, secret);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
