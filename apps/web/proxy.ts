import { type NextRequest, NextResponse } from "next/server";

/**
 * Coarse redirects only (PROMPT D17, §15): no session cookie → the right sign-in page.
 * This never authorizes anything — layouts ask the API (`GET /v1/auth/me`), and the API enforces.
 */
const SESSION_COOKIE = "fc_session";

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  // Client sign-in (/client/login, email OTP) arrives in step 4.1; the platform login with MFA in 6.1.
  // Until then everyone signs in through /login and the API decides what they may open.
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*"],
};
