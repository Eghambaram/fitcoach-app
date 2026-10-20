import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";
import { ZodValidationPipe } from "nestjs-zod";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { LoggingModule } from "./common/logging/logging.module";
import { CsrfGuard } from "./common/security/csrf.guard";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./db/database.module";
import { AuditModule } from "./modules/audit/audit.module";
import { HealthModule } from "./modules/health/health.module";
import { JobsModule } from "./modules/jobs/jobs.module";

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    DatabaseModule,
    AuditModule,
    JobsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: CSRF runs before the session/role/workspace guards added in step 1.3.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
