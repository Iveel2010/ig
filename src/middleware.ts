import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow API, Next internals, static files, and auth pages
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/signup" ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // Allow requests for assets (files with extension)
  if (/\.[^\/]+$/.test(pathname)) {
    return NextResponse.next();
  }

  // If no session cookie, redirect to signup
  const session = req.cookies.get("session")?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signup";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
