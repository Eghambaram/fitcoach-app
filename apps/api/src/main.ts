import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

const DEFAULT_PORT = 4000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  // Zod-validated config arrives in step 1.2; until then PORT is the only setting the API reads.
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  // Listen on '::' (IPv4 + IPv6) — Railway private networking needs it (PROMPT §17.1).
  await app.listen(port, "::");
}

void bootstrap();
