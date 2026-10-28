import { Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  PLATFORM_RECOVERY_CODE_COUNT,
  type PlatformAuthStatus,
  type PlatformLoginRequest,
  type PlatformLoginResponse,
  type PlatformMfaEnableResponse,
  type PlatformMfaSetupResponse,
  type PlatformMfaVerifyRequest,
} from "@fitcoach/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { generateSecret, generateURI, verify } from "otplib";
import { toString as qrToString } from "qrcode";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { decryptSecret, encryptSecret } from "../../common/security/encryption";
import { verifyAgainstDummy, verifyPassword } from "../../common/security/passwords";
import { RateLimitService } from "../../common/security/rate-limit.service";
import type { RequestMeta } from "../../common/security/request-meta";
import { generateRecoveryCode, hashToken } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import { platformMfa, platformRecoveryCodes, platformRoles, users } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { recordAudit } from "../audit/audit.service";
import { type NewSession, SessionsService } from "../auth/sessions.service";

const MINUTE = 60;
/** One period either side: tolerates a phone clock up to 30 s off. */
const EPOCH_TOLERANCE_SECONDS = 30;

const invalidCredentials = () =>
  new DomainError(ERROR_CODES.INVALID_CREDENTIALS, 401, "That email and password don't match.");
const wrongCode = () =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "That code didn't work. Try the next one.", {
    code: ["That code didn't work. Check the time on your phone and try the next one."],
  });

const normalizeRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Platform owner sign-in (PROMPT §12.2, §16.0, ADR-0062): password → AAL1 session (12 h absolute)
 * → TOTP code (or a one-time recovery code) → AAL2. The first sign-in enrols the authenticator.
 * Pre-session lookups and the MFA tables are fitcoach_system only.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly sessions: SessionsService,
    private readonly rateLimit: RateLimitService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private owner(): AuthContext {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "platform_owner") throw DomainError.forbidden();
    return auth;
  }

  async login(
    input: PlatformLoginRequest,
    meta: RequestMeta,
  ): Promise<{ session: NewSession; next: PlatformLoginResponse["next"] }> {
    await this.rateLimit.consume(
      { key: `platform-login:ip:${meta.ipHash ?? "unknown"}`, windowSeconds: 15 * MINUTE, max: 10 },
      {
        key: `platform-login:email:${hashToken(this.config.ipHashSalt, input.email)}`,
        windowSeconds: 15 * MINUTE,
        max: 5,
      },
    );
    const account = await this.systemDb.run(
      "platform auth: look up owner for login",
      async (tx) => {
        const [row] = await tx
          .select({
            id: users.id,
            passwordHash: users.passwordHash,
            status: users.status,
            emailVerifiedAt: users.emailVerifiedAt,
            role: platformRoles.role,
            mfaEnabledAt: platformMfa.enabledAt,
          })
          .from(users)
          .leftJoin(
            platformRoles,
            and(
              eq(platformRoles.userId, users.id),
              eq(platformRoles.role, "platform_owner"),
              isNull(platformRoles.revokedAt),
            ),
          )
          .leftJoin(platformMfa, eq(platformMfa.userId, users.id))
          .where(eq(users.email, input.email));
        return row;
      },
    );
    if (!account?.passwordHash) {
      await verifyAgainstDummy(input.password);
      throw invalidCredentials();
    }
    const passwordOk = await verifyPassword(account.passwordHash, input.password);
    // Not an owner, disabled or unverified looks exactly like a wrong password (non-enumerating).
    if (
      !passwordOk ||
      account.status !== "active" ||
      account.role === null ||
      account.emailVerifiedAt === null
    ) {
      throw invalidCredentials();
    }
    const session = await this.systemDb.run("platform auth: create AAL1 session", async (tx) => {
      const created = await this.sessions.create(tx, {
        userId: account.id,
        actor: "platform_owner",
        workspaceId: null,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
      });
      await recordAudit(tx, {
        actorKind: "platform_owner",
        actorUserId: account.id,
        workspaceId: null,
        action: "platform.session_created",
        targetType: "session",
        targetId: created.id,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      return created;
    });
    return { session, next: account.mfaEnabledAt ? "mfa_verify" : "mfa_setup" };
  }

  async status(): Promise<PlatformAuthStatus> {
    const auth = this.owner();
    const enabled = await this.systemDb.run("platform auth: read MFA status", async (tx) => {
      const [row] = await tx
        .select({ enabledAt: platformMfa.enabledAt })
        .from(platformMfa)
        .where(eq(platformMfa.userId, auth.userId));
      return Boolean(row?.enabledAt);
    });
    return { aal: auth.aal, mfaEnabled: enabled };
  }

  /** A new authenticator secret (replacing an unconfirmed one). Refused once MFA is enabled. */
  async setup(): Promise<PlatformMfaSetupResponse> {
    const auth = this.owner();
    const secret = generateSecret();
    const email = await this.systemDb.run("platform auth: start MFA enrolment", async (tx) => {
      const [existing] = await tx
        .select({ enabledAt: platformMfa.enabledAt })
        .from(platformMfa)
        .where(eq(platformMfa.userId, auth.userId));
      if (existing?.enabledAt) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "Your authenticator is already set up. Sign in with its code.",
        );
      }
      const ciphertext = encryptSecret(this.config.encryptionKey, secret);
      await tx
        .insert(platformMfa)
        .values({ userId: auth.userId, secretCiphertext: ciphertext })
        .onConflictDoUpdate({
          target: platformMfa.userId,
          set: { secretCiphertext: ciphertext, lastTimeStep: null, createdAt: sql`now()` },
        });
      const [user] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, auth.userId));
      return user?.email ?? "platform owner";
    });
    const otpauthUri = generateURI({ issuer: "FitCoach Platform", label: email, secret });
    return {
      secret,
      otpauthUri,
      qrSvg: await qrToString(otpauthUri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    };
  }

  /** Confirms the first code: MFA is on, recovery codes are issued once, the session is AAL2. */
  async enable(code: string, meta: RequestMeta): Promise<PlatformMfaEnableResponse> {
    const auth = this.owner();
    await this.limitCodes(auth.userId);
    return this.systemDb.run("platform auth: confirm MFA enrolment", async (tx) => {
      const [mfa] = await tx
        .select()
        .from(platformMfa)
        .where(eq(platformMfa.userId, auth.userId))
        .for("update");
      if (!mfa) throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Start the setup again.");
      if (mfa.enabledAt) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "Your authenticator is already set up.",
        );
      }
      const timeStep = await this.checkCode(mfa, code);
      if (timeStep === null) throw wrongCode();

      const recoveryCodes = Array.from(
        { length: PLATFORM_RECOVERY_CODE_COUNT },
        generateRecoveryCode,
      );
      await tx
        .update(platformMfa)
        .set({ enabledAt: sql`now()`, lastTimeStep: timeStep })
        .where(eq(platformMfa.userId, auth.userId));
      await tx.delete(platformRecoveryCodes).where(eq(platformRecoveryCodes.userId, auth.userId));
      await tx.insert(platformRecoveryCodes).values(
        recoveryCodes.map((value) => ({
          userId: auth.userId,
          codeHash: hashToken(this.config.sessionSecret, normalizeRecovery(value)),
        })),
      );
      await this.sessions.elevate(tx, auth.sessionId);
      await this.audit(tx, auth, "platform.mfa_enabled", meta);
      return { recoveryCodes };
    });
  }

  /** A TOTP code (never the same one twice) or an unused recovery code raises the session to AAL2. */
  async verify(input: PlatformMfaVerifyRequest, meta: RequestMeta): Promise<void> {
    const auth = this.owner();
    await this.limitCodes(auth.userId);
    await this.systemDb.run("platform auth: verify MFA code", async (tx) => {
      const [mfa] = await tx
        .select()
        .from(platformMfa)
        .where(eq(platformMfa.userId, auth.userId))
        .for("update");
      if (!mfa?.enabledAt) {
        throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Set up your authenticator first.");
      }
      if (input.code !== undefined) {
        const timeStep = await this.checkCode(mfa, input.code);
        if (timeStep === null) throw wrongCode();
        await tx
          .update(platformMfa)
          .set({ lastTimeStep: timeStep })
          .where(eq(platformMfa.userId, auth.userId));
        await this.sessions.elevate(tx, auth.sessionId);
        await this.audit(tx, auth, "platform.mfa_verified", meta);
        return;
      }
      const used = await tx
        .update(platformRecoveryCodes)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(platformRecoveryCodes.userId, auth.userId),
            eq(
              platformRecoveryCodes.codeHash,
              hashToken(this.config.sessionSecret, normalizeRecovery(input.recoveryCode ?? "")),
            ),
            isNull(platformRecoveryCodes.usedAt),
          ),
        )
        .returning({ id: platformRecoveryCodes.id });
      if (used.length === 0) {
        throw new DomainError(
          ERROR_CODES.VALIDATION_FAILED,
          400,
          "That recovery code didn't work.",
          {
            recoveryCode: ["That code is wrong or has already been used."],
          },
        );
      }
      await this.sessions.elevate(tx, auth.sessionId);
      await this.audit(tx, auth, "platform.recovery_code_used", meta);
    });
  }

  /** The matched time step, or null. Codes at or before the last accepted step are replays. */
  private async checkCode(
    mfa: typeof platformMfa.$inferSelect,
    code: string,
  ): Promise<number | null> {
    const secret = decryptSecret(this.config.encryptionKey, mfa.secretCiphertext);
    const result = await verify({
      secret,
      token: code,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
      ...(mfa.lastTimeStep === null ? {} : { afterTimeStep: mfa.lastTimeStep }),
    });
    return result.valid && "timeStep" in result ? result.timeStep : null;
  }

  private limitCodes(userId: string): Promise<void> {
    return this.rateLimit.consume({
      key: `platform-mfa:user:${userId}`,
      windowSeconds: 15 * MINUTE,
      max: 10,
    });
  }

  private audit(tx: Tx, auth: AuthContext, action: string, meta: RequestMeta): Promise<void> {
    return recordAudit(tx, {
      actorKind: "platform_owner",
      actorUserId: auth.userId,
      workspaceId: null,
      action,
      targetType: "session",
      targetId: auth.sessionId,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }
}
