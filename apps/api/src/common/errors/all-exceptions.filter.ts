import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { toApiError } from "./to-api-error";

/** Every error leaves the API as `{ code, message, fieldErrors?, requestId }` (CLAUDE.md rule 26). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const requestId = String(request.id ?? response.getHeader("x-request-id") ?? "unknown");

    const { status, body, unexpected } = toApiError(exception);
    if (unexpected) {
      this.logger.error({ err: exception, requestId }, "request failed");
    }

    if (response.headersSent) return;
    response.status(status).json({ ...body, requestId });
  }
}
