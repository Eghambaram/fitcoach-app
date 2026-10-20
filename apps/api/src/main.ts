import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { AppConfig } from "./config/env";
import { loadLocalEnv } from "./config/load-env";

async function bootstrap(): Promise<void> {
  loadLocalEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  // SIGTERM (Railway redeploy) → pg-boss stops gracefully, pools close.
  app.enableShutdownHooks();

  const { port } = app.get(AppConfig);
  // Listen on '::' (IPv4 + IPv6) — Railway private networking needs it (PROMPT §17.1).
  await app.listen(port, "::");
}

void bootstrap();
