/**
 * Writes the OpenAPI document for `pnpm api:client` (→ packages/api-client).
 * Builds the module graph without starting it: no listener, no pg-boss, no DB connections.
 */
import "reflect-metadata";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { API_PREFIX, createOpenApiDocument } from "./app.setup";
import { loadLocalEnv } from "./config/load-env";

// Runs from dist/ (decorator metadata needs the tsc build): apps/api/dist → packages/api-client.
const OUTPUT = resolve(__dirname, "../../../packages/api-client/openapi.json");

async function main(): Promise<void> {
  loadLocalEnv();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix(API_PREFIX);
  const document = createOpenApiDocument(app);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`[openapi] wrote ${OUTPUT}`);
  // The app was never initialised, so pg-boss never started; this only closes the idle pools.
  await app.close();
}

main().catch((error: unknown) => {
  console.error("[openapi] failed:", error);
  process.exit(1);
});
