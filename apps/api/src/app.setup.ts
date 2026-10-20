import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { Logger } from "nestjs-pino";
import { AppConfig } from "./config/env";

export const API_PREFIX = "v1";

/** Shared app configuration so tests and scripts boot the API exactly as `main.ts` does. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));

  const express = app.getHttpAdapter().getInstance() as Express;
  // Trust X-Forwarded-* only from the private-network hop (the web proxy / Railway edge), PROMPT §4.2.
  express.set("trust proxy", "loopback, linklocal, uniquelocal");

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);

  // OpenAPI is served only outside production (PROMPT §15).
  if (!config.isProduction) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => createOpenApiDocument(app));
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("FitCoach API")
      .setDescription("Reached by the browser only through the web app's same-origin /api proxy.")
      .setVersion("1")
      .build(),
  );
  return cleanupOpenApiDoc(document);
}
