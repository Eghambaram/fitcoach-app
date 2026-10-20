import { createHash } from "node:crypto";

/**
 * Raw IPs are never logged or stored (CLAUDE.md rule 13). A salted SHA-256 keeps them correlatable
 * for rate limits and abuse investigation without revealing the address.
 */
export function hashIp(ip: string | undefined, salt: string): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
