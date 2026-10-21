import type { Request } from "express";
import { hashIp } from "./ip-hash";

/** What services may record about a request: never the raw IP (CLAUDE.md rule 13). */
export interface RequestMeta {
  ipHash?: string;
  userAgent?: string;
  requestId?: string;
}

export function requestMeta(request: Request & { id?: unknown }, ipHashSalt: string): RequestMeta {
  const userAgent = request.headers["user-agent"];
  return {
    ipHash: hashIp(request.ip, ipHashSalt),
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 300) : undefined,
    requestId: typeof request.id === "string" ? request.id : undefined,
  };
}
