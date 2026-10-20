import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";
import { ZodValidationPipe } from "nestjs-zod";
import { RolesGuard, SessionGuard, WorkspaceGuard } from "./common/auth/guards";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { LoggingModule } from "./common/logging/logging.module";
import { CsrfGuard } from "./common/security/csrf.guard";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./db/database.module";
import { EmailModule } from "./integrations/email/email.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { JobsModule } from "./modules/jobs/jobs.module";

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    DatabaseModule,
    AuditModule,
    EmailModule,
    JobsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Guard order (PROMPT §4.3): CSRF → session → role → workspace status.
    // ClientScopeGuard (4.1) and PlatformMfaGuard (6.1) join this chain later.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
