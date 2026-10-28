import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  addMeasurementRequestSchema,
  type ClientProgressResponse,
  clientProgressResponseSchema,
  createMeasurementTypeRequestSchema,
  type MeasurementType,
  measurementTypeSchema,
  type MeasurementTypesResponse,
  measurementTypesResponseSchema,
  type PortalProgressResponse,
  portalProgressResponseSchema,
  type ProgressOverviewResponse,
  progressOverviewResponseSchema,
  updateProgressSharesRequestSchema,
  voidMeasurementRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Roles } from "../../common/auth/decorators";
import { ProgressService } from "./progress.service";

class AddMeasurementDto extends createZodDto(addMeasurementRequestSchema) {}
class ClientProgressDto extends createZodDto(clientProgressResponseSchema) {}
class CreateTypeDto extends createZodDto(createMeasurementTypeRequestSchema) {}
class MeasurementTypeDto extends createZodDto(measurementTypeSchema) {}
class MeasurementTypesDto extends createZodDto(measurementTypesResponseSchema) {}
class PortalProgressDto extends createZodDto(portalProgressResponseSchema) {}
class OverviewDto extends createZodDto(progressOverviewResponseSchema) {}
class SharingDto extends createZodDto(updateProgressSharesRequestSchema) {}
class VoidDto extends createZodDto(voidMeasurementRequestSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Trainer: measurements, custom types, sharing and the overview (PROMPT §8.8). */
@ApiTags("progress")
@Roles("trainer")
@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get("measurement-types")
  @ApiOkResponse({ type: MeasurementTypesDto })
  types(): Promise<MeasurementTypesResponse> {
    return this.progress.types();
  }

  @Post("measurement-types")
  @HttpCode(201)
  @ApiOkResponse({ type: MeasurementTypeDto })
  createType(@Body() body: CreateTypeDto): Promise<MeasurementType> {
    return this.progress.createType(body);
  }

  /** Each client's recent changes; never averaged across clients. */
  @Get("progress")
  @ApiOkResponse({ type: OverviewDto })
  overview(): Promise<ProgressOverviewResponse> {
    return this.progress.overview();
  }

  @Get("clients/:id/progress")
  @ApiOkResponse({ type: ClientProgressDto })
  clientProgress(@Param() params: IdParamDto): Promise<ClientProgressResponse> {
    return this.progress.clientProgress(params.id);
  }

  @Post("clients/:id/measurements")
  @HttpCode(201)
  @ApiOkResponse({ type: ClientProgressDto })
  add(
    @Param() params: IdParamDto,
    @Body() body: AddMeasurementDto,
  ): Promise<ClientProgressResponse> {
    return this.progress.add(params.id, body);
  }

  /** Corrections void the value (kept in history); enter the right one as a new value. */
  @Post("measurements/:id/void")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientProgressDto })
  void(@Param() params: IdParamDto, @Body() body: VoidDto): Promise<ClientProgressResponse> {
    return this.progress.void(params.id, body);
  }

  @Put("clients/:id/progress-sharing")
  @ApiOkResponse({ type: ClientProgressDto })
  sharing(@Param() params: IdParamDto, @Body() body: SharingDto): Promise<ClientProgressResponse> {
    return this.progress.setSharing(params.id, body);
  }
}

/** Client: their shared metrics (PROMPT §9). */
@ApiTags("client")
@Roles("client")
@Controller("client")
export class ClientProgressController {
  constructor(private readonly progress: ProgressService) {}

  @AllowInactiveWorkspace()
  @Get("progress")
  @ApiOkResponse({ type: PortalProgressDto })
  get(): Promise<PortalProgressResponse> {
    return this.progress.forClient();
  }

  /** Only with progress self-logging on, and only for a shared metric. */
  @Post("measurements")
  @HttpCode(201)
  @ApiOkResponse({ type: PortalProgressDto })
  add(@Body() body: AddMeasurementDto): Promise<PortalProgressResponse> {
    return this.progress.addOwn(body);
  }
}
