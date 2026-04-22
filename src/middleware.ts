import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("session")?.value;

  // 1. Redirect away from auth pages if already logged in
  if (
    session &&
    (pathname === "/signup" ||
      pathname === "/login" ||
      pathname === "/admin/login")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 2. Allow API, Next internals, static files, and auth pages (if not already logged in)
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/signup" ||
    pathname === "/login" ||
    pathname === "/admin/login" ||
    /\.[^\/]+$/.test(pathname) // assets with extension
  ) {
    return NextResponse.next();
  }

  // 3. Admin dashboard check
  if (pathname.startsWith("/admin")) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 4. Require authentication for everything else (e.g., home page, dashboard)
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signup";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
