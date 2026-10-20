import type { Request, Response } from "express";

/** Opaque session cookie (PROMPT §12.2): httpOnly, SameSite=Lax, Secure outside local dev, Path=/. */
export const SESSION_COOKIE = "fc_session";

export function readSessionCookie(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : undefined;
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response, secure: boolean): void {
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}
