import { Body, Controller, Get, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  cancelPackageRequestSchema,
  type ClientPackagesResponse,
  clientPackagesResponseSchema,
  recordPaymentRequestSchema,
  sellPackageRequestSchema,
  sessionAdjustmentRequestSchema,
  voidPaymentRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { PackagesService } from "./packages.service";

class ClientPackagesResponseDto extends createZodDto(clientPackagesResponseSchema) {}
class SellPackageRequestDto extends createZodDto(sellPackageRequestSchema) {}
class RecordPaymentRequestDto extends createZodDto(recordPaymentRequestSchema) {}
class VoidPaymentRequestDto extends createZodDto(voidPaymentRequestSchema) {}
class SessionAdjustmentRequestDto extends createZodDto(sessionAdjustmentRequestSchema) {}
class CancelPackageRequestDto extends createZodDto(cancelPackageRequestSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/**
 * Packages, sessions and payments (PROMPT §8.3A). Trainer only; the workspace comes from the session
 * (CLAUDE.md rule 1) and ids in the path are always checked against it.
 */
@ApiTags("packages")
@Roles("trainer")
@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get("clients/:id/packages")
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  forClient(@Param() params: IdParamDto): Promise<ClientPackagesResponse> {
    return this.packages.forClient(params.id);
  }

  /** Sell, or renew: an active package is closed in the same transaction. */
  @Post("clients/:id/packages")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  sell(
    @Param() params: IdParamDto,
    @Body() body: SellPackageRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<ClientPackagesResponse> {
    return this.packages.sell(params.id, body, idempotencyKey);
  }

  @Post("packages/:id/cancel")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  cancel(
    @Param() params: IdParamDto,
    @Body() body: CancelPackageRequestDto,
  ): Promise<ClientPackagesResponse> {
    return this.packages.cancel(params.id, body);
  }

  /** Recorded manually: FitCoach processes no payments. */
  @Post("packages/:id/payments")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  recordPayment(
    @Param() params: IdParamDto,
    @Body() body: RecordPaymentRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<ClientPackagesResponse> {
    return this.packages.recordPayment(params.id, body, idempotencyKey);
  }

  @Post("packages/:id/adjustments")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  adjust(
    @Param() params: IdParamDto,
    @Body() body: SessionAdjustmentRequestDto,
  ): Promise<ClientPackagesResponse> {
    return this.packages.adjust(params.id, body);
  }

  @Post("payments/:id/void")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientPackagesResponseDto })
  voidPayment(
    @Param() params: IdParamDto,
    @Body() body: VoidPaymentRequestDto,
  ): Promise<ClientPackagesResponse> {
    return this.packages.voidPayment(params.id, body);
  }
}
