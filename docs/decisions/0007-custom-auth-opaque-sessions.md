# ADR-0007: Auth built in the API with opaque, revocable Postgres sessions

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D7, §12.2)

## Decision
Email + password (argon2id), email OTP / magic link, TOTP MFA (mandatory for platform owners). Sessions are 32 random bytes in an `httpOnly; Secure; SameSite=Lax` cookie `fc_session`, stored as SHA-256 in `sessions`. No JWT sessions. Google OAuth is a v1.1 boundary and is not installed in the MVP.

## Why
Immediate revocation on logout, password change, archive and suspension; simple to audit.

## Consequences
- Trainers 30-day sliding, clients 60-day sliding, platform owners 12 h absolute + AAL2.
- All tokens (verify, reset, OTP, invite) are random, hashed, expiring and single-use; auth responses are constant-time and non-enumerating.
- We own rate limits on login, OTP, reset and invite acceptance (Postgres-backed).
- `arctic` (Google) and trainer MFA are not built until v1.1.
