import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";

/**
 * Boots the real AppModule (guards, pipes, filter, DB context, pg-boss) against the Testcontainers
 * database, exactly as main.ts configures it. `controllers` adds test-only probe endpoints.
 */
export async function createTestApp(controllers: Type[] = []): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

/** Headers a legitimate browser request through the web proxy carries (PROMPT §12.2). */
export const WEB_HEADERS = { origin: "http://localhost:3000", "x-fitcoach-request": "1" } as const;
