import { type NextRequest, NextResponse } from "next/server";

/**
 * Coarse redirects only (PROMPT D17, §15): no session cookie → the right sign-in page.
 * This never authorizes anything — layouts ask the API (`GET /v1/auth/me`, `GET /v1/client/me`),
 * and the API enforces.
 */
const SESSION_COOKIE = "fc_session";

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/client/login" || pathname === "/platform/login") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // Clients sign in with an email code; platform owners with a password and an authenticator.
  if (pathname === "/client" || pathname.startsWith("/client/")) {
    return NextResponse.redirect(new URL("/client/login", request.url));
  }
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    return NextResponse.redirect(new URL("/platform/login", request.url));
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/client", "/client/:path*"],
};
