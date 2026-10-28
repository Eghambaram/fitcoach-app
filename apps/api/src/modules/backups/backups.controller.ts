import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { backupHeartbeatSchema, type OkResponse } from "@fitcoach/shared";
import type { Request } from "express";
import { createZodDto } from "nestjs-zod";
import { Public, SkipCsrf } from "../../common/auth/decorators";
import { requestMeta } from "../../common/security/request-meta";
import { AppConfig } from "../../config/env";
import { SkipDbContext } from "../../db/db-context";
import { OkResponseDto } from "../auth/auth.dto";
import { BackupsService } from "./backups.service";

class BackupHeartbeatDto extends createZodDto(backupHeartbeatSchema) {}

/**
 * Machine endpoint for the db-backup cron (PROMPT §17.2). No session: a bearer token
 * (BACKUP_HEARTBEAT_TOKEN), rate-limited, reached over Railway's private network.
 */
@ApiTags("internal")
@SkipDbContext()
@Controller("internal/backups")
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @SkipCsrf()
  @Post("heartbeat")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async heartbeat(
    @Body() body: BackupHeartbeatDto,
    @Headers("authorization") authorization: string | undefined,
    @Req() request: Request,
  ): Promise<OkResponse> {
    await this.backups.record(authorization, body, requestMeta(request, this.config.ipHashSalt));
    return { ok: true };
  }
}
