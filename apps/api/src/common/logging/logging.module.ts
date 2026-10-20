import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { AppConfig } from "../../config/env";
import { hashIp } from "../security/ip-hash";

/** Accept the web proxy's request id when it looks like one; otherwise mint a new UUID. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * JSON logs to stdout with a request id propagated web → API (PROMPT §17.5).
 * Never logs tokens, cookies, emails, phones, query strings or raw IPs (CLAUDE.md rule 13).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = resolveRequestId(req.headers["x-request-id"]);
            res.setHeader("x-request-id", id);
            return id;
          },
          autoLogging: { ignore: (req: IncomingMessage) => req.url === "/v1/health" },
          serializers: {
            req: (req: {
              id?: unknown;
              method?: string;
              url?: string;
              remoteAddress?: string;
            }) => ({
              id: req.id,
              method: req.method,
              // Path only: query strings can carry search terms with names, emails or phones.
              path: req.url?.split("?")[0],
              ipHash: hashIp(req.remoteAddress, config.ipHashSalt),
            }),
            res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
          },
          redact: {
            paths: ["req.headers", "res.headers", "*.password", "*.token", "*.email", "*.phone"],
            remove: true,
          },
          ...(config.appEnv === "development"
            ? { transport: { target: "pino-pretty", options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
