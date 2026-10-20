import { type INestApplication } from "@nestjs/common";

/** Shared app configuration so tests boot the API exactly as `main.ts` does. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("v1");
}
