import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  assignProgramRequestSchema,
  type AssignProgramResponse,
  assignProgramResponseSchema,
  type ClientWorkoutsResponse,
  clientWorkoutsResponseSchema,
  createProgramRequestSchema,
  type ProgramDetail,
  programDetailSchema,
  programInputSchema,
  type ProgramListResponse,
  programListResponseSchema,
  type ProgramTemplatesResponse,
  programTemplatesResponseSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { AssignmentsService } from "./assignments.service";
import { ProgramsService } from "./programs.service";

class ProgramTemplatesResponseDto extends createZodDto(programTemplatesResponseSchema) {}
class ProgramListResponseDto extends createZodDto(programListResponseSchema) {}
class ProgramDetailDto extends createZodDto(programDetailSchema) {}
class ProgramInputDto extends createZodDto(programInputSchema) {}
class CreateProgramRequestDto extends createZodDto(createProgramRequestSchema) {}
class AssignProgramRequestDto extends createZodDto(assignProgramRequestSchema) {}
class AssignProgramResponseDto extends createZodDto(assignProgramResponseSchema) {}
class ClientWorkoutsResponseDto extends createZodDto(clientWorkoutsResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}
class ProgramListQueryDto extends createZodDto(
  z.object({ archived: z.coerce.boolean().default(false) }),
) {}

/** Programs, starter templates and assignment (PROMPT §8.5). Trainer only. */
@ApiTags("programs")
@Roles("trainer")
@Controller()
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly assignments: AssignmentsService,
  ) {}

  @Get("programs")
  @ApiOkResponse({ type: ProgramListResponseDto })
  list(@Query() query: ProgramListQueryDto): Promise<ProgramListResponse> {
    return this.programs.list(query.archived);
  }

  /** Declared before `programs/:id`. */
  @Get("programs/templates")
  @ApiOkResponse({ type: ProgramTemplatesResponseDto })
  templates(): Promise<ProgramTemplatesResponse> {
    return this.programs.templates();
  }

  /** Blank, or a copy: "Start from template", "Duplicate", "Save as template". */
  @Post("programs")
  @ApiOkResponse({ type: ProgramDetailDto })
  create(@Body() body: CreateProgramRequestDto): Promise<ProgramDetail> {
    return this.programs.create(body);
  }

  @Get("programs/:id")
  @ApiOkResponse({ type: ProgramDetailDto })
  get(@Param() params: IdParamDto): Promise<ProgramDetail> {
    return this.programs.get(params.id);
  }

  /** Saves the whole program (workouts and exercises in order). */
  @Put("programs/:id")
  @ApiOkResponse({ type: ProgramDetailDto })
  save(@Param() params: IdParamDto, @Body() body: ProgramInputDto): Promise<ProgramDetail> {
    return this.programs.save(params.id, body);
  }

  @Post("programs/:id/archive")
  @HttpCode(200)
  @ApiOkResponse({ type: ProgramDetailDto })
  archive(@Param() params: IdParamDto): Promise<ProgramDetail> {
    return this.programs.setArchived(params.id, true);
  }

  @Post("programs/:id/restore")
  @HttpCode(200)
  @ApiOkResponse({ type: ProgramDetailDto })
  restore(@Param() params: IdParamDto): Promise<ProgramDetail> {
    return this.programs.setArchived(params.id, false);
  }

  /** Assign to a client: snapshot, schedule and planned sessions in one transaction. */
  @Post("programs/:id/assign")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: AssignProgramResponseDto })
  assign(
    @Param() params: IdParamDto,
    @Body() body: AssignProgramRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<AssignProgramResponse> {
    return this.assignments.assign(params.id, body, idempotencyKey);
  }

  @Get("clients/:id/workouts")
  @ApiOkResponse({ type: ClientWorkoutsResponseDto })
  clientWorkouts(@Param() params: IdParamDto): Promise<ClientWorkoutsResponse> {
    return this.assignments.forClient(params.id);
  }

  @Post("assignments/:id/end")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientWorkoutsResponseDto })
  end(@Param() params: IdParamDto): Promise<ClientWorkoutsResponse> {
    return this.assignments.end(params.id);
  }
}
