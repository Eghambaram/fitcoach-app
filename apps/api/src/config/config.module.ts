import { Global, Module } from "@nestjs/common";
import { AppConfig, parseEnv } from "./env";

/** Validates the environment once at boot and refuses to start on invalid config (PROMPT §12.1). */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => parseEnv(process.env) }],
  exports: [AppConfig],
})
export class ConfigModule {}
