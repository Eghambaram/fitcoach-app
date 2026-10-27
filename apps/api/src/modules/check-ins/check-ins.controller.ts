import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  checkInInputSchema,
  checkInListQuerySchema,
  type CheckInListResponse,
  checkInListResponseSchema,
  type ClientCheckInResponse,
  clientCheckInResponseSchema,
  type ClientCheckInsResponse,
  clientCheckInsResponseSchema,
  reviewCheckInRequestSchema,
  type TrainerCheckIn,
  trainerCheckInSchema,
  updateCheckInSettingsRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Roles } from "../../common/auth/decorators";
import { CheckInsService } from "./check-ins.service";

class CheckInInputDto extends createZodDto(checkInInputSchema) {}
class CheckInListQueryDto extends createZodDto(checkInListQuerySchema) {}
class CheckInListResponseDto extends createZodDto(checkInListResponseSchema) {}
class ClientCheckInResponseDto extends createZodDto(clientCheckInResponseSchema) {}
class ClientCheckInsResponseDto extends createZodDto(clientCheckInsResponseSchema) {}
class ReviewCheckInRequestDto extends createZodDto(reviewCheckInRequestSchema) {}
class TrainerCheckInDto extends createZodDto(trainerCheckInSchema) {}
class UpdateCheckInSettingsDto extends createZodDto(updateCheckInSettingsRequestSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Trainer: the check-in inbox and per-client check-ins (PROMPT §8.7). */
@ApiTags("check-ins")
@Roles("trainer")
@Controller()
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Get("check-ins")
  @ApiOkResponse({ type: CheckInListResponseDto })
  list(@Query() query: CheckInListQueryDto): Promise<CheckInListResponse> {
    return this.checkIns.list(query);
  }

  @Post("check-ins/:id/review")
  @HttpCode(200)
  @ApiOkResponse({ type: TrainerCheckInDto })
  review(
    @Param() params: IdParamDto,
    @Body() body: ReviewCheckInRequestDto,
  ): Promise<TrainerCheckIn> {
    return this.checkIns.review(params.id, body);
  }

  @Get("clients/:id/check-ins")
  @ApiOkResponse({ type: ClientCheckInsResponseDto })
  clientCheckIns(@Param() params: IdParamDto): Promise<ClientCheckInsResponse> {
    return this.checkIns.clientCheckIns(params.id);
  }

  @Put("clients/:id/check-in-settings")
  @ApiOkResponse({ type: ClientCheckInsResponseDto })
  settings(
    @Param() params: IdParamDto,
    @Body() body: UpdateCheckInSettingsDto,
  ): Promise<ClientCheckInsResponse> {
    return this.checkIns.updateSettings(params.id, body);
  }
}

/** Client: today's check-in (PROMPT §8.7, §9). */
@ApiTags("client")
@Roles("client")
@Controller("client/check-in")
export class ClientCheckInController {
  constructor(private readonly checkIns: CheckInsService) {}

  @AllowInactiveWorkspace()
  @Get()
  @ApiOkResponse({ type: ClientCheckInResponseDto })
  get(): Promise<ClientCheckInResponse> {
    return this.checkIns.forClient();
  }

  /** Sends today's check-in, or edits it until local midnight. */
  @Put()
  @ApiOkResponse({ type: ClientCheckInResponseDto })
  submit(@Body() body: CheckInInputDto): Promise<ClientCheckInResponse> {
    return this.checkIns.submit(body);
  }
}
