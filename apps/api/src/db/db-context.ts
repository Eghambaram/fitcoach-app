import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { PinoLogger } from "nestjs-pino";
import { from, lastValueFrom, type Observable } from "rxjs";
import type { AppClsStore } from "../common/request-context";
import { AppDatabase, type Tx } from "./database";

const SKIP_DB_CONTEXT = "fitcoach:skipDbContext";

/** For handlers that never touch tenant data (e.g. liveness); no transaction is opened. */
export const SkipDbContext = () => SetMetadata(SKIP_DB_CONTEXT, true);

/**
 * Wraps each request handler in one transaction on the fitcoach_app pool and applies the RLS
 * context with `set_config(…, true)` (PROMPT §4.3). The values come only from the session-derived
 * auth context in CLS — never from the request (CLAUDE.md rule 1). Without a session every
 * setting is empty, so RLS returns no rows. The response is sent only after the commit.
 */
@Injectable()
export class DbContextInterceptor implements NestInterceptor {
  constructor(
    private readonly database: AppDatabase,
    private readonly cls: ClsService<AppClsStore>,
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DbContextInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_DB_CONTEXT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const auth = this.cls.get("auth");
    return from(this.inTransaction(auth, next));
  }

  private async inTransaction(auth: AppClsStore["auth"], next: CallHandler): Promise<unknown> {
    this.cls.set("afterCommit", []);
    const result = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`
          select
            set_config('app.user_id', ${auth?.userId ?? ""}, true),
            set_config('app.workspace_id', ${auth?.workspaceId ?? ""}, true),
            set_config('app.client_id', ${auth?.clientId ?? ""}, true),
            set_config('app.actor', ${auth?.actor ?? ""}, true)
        `);
      this.cls.set("tx", tx);
      try {
        return await lastValueFrom(next.handle(), { defaultValue: undefined });
      } finally {
        this.cls.set("tx", undefined);
      }
    });
    const callbacks = this.cls.get("afterCommit") ?? [];
    this.cls.set("afterCommit", undefined);
    for (const callback of callbacks) {
      // The change is committed: a failed follow-up (e.g. queueing a job) is logged, not returned.
      await callback().catch((error: unknown) =>
        this.logger.error({ err: error }, "after-commit callback failed"),
      );
    }
    return result;
  }
}

/** Gives repositories the current request transaction (with RLS context applied). */
@Injectable()
export class DbContext {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  get tx(): Tx {
    const tx = (this.cls.isActive() ? this.cls.get("tx") : undefined) as Tx | undefined;
    if (!tx) {
      // Querying outside the request transaction would run without RLS context and silently see nothing.
      throw new Error(
        "No request transaction: DB access must happen inside a request handled by DbContextInterceptor",
      );
    }
    return tx;
  }

  /** Runs `callback` after the request transaction commits (never if it rolls back). */
  afterCommit(callback: () => Promise<void>): void {
    const callbacks = this.cls.isActive() ? this.cls.get("afterCommit") : undefined;
    if (!callbacks) throw new Error("No request transaction to run after");
    callbacks.push(callback);
  }
}
