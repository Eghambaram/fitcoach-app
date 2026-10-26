import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type Exercise,
  exerciseInputSchema,
  exerciseListQuerySchema,
  type ExerciseListResponse,
  exerciseListResponseSchema,
  exerciseSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { ExercisesService } from "./exercises.service";

class ExerciseListQueryDto extends createZodDto(exerciseListQuerySchema) {}
class ExerciseListResponseDto extends createZodDto(exerciseListResponseSchema) {}
class ExerciseDto extends createZodDto(exerciseSchema) {}
class ExerciseInputDto extends createZodDto(exerciseInputSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Exercise library (PROMPT §8.5). The global seed is read-only; custom exercises are per workspace. */
@ApiTags("exercises")
@Roles("trainer")
@Controller("exercises")
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  @ApiOkResponse({ type: ExerciseListResponseDto })
  list(@Query() query: ExerciseListQueryDto): Promise<ExerciseListResponse> {
    return this.exercises.list(query);
  }

  @Get(":id")
  @ApiOkResponse({ type: ExerciseDto })
  get(@Param() params: IdParamDto): Promise<Exercise> {
    return this.exercises.get(params.id);
  }

  @Post()
  @ApiOkResponse({ type: ExerciseDto })
  create(@Body() body: ExerciseInputDto): Promise<Exercise> {
    return this.exercises.create(body);
  }

  @Put(":id")
  @ApiOkResponse({ type: ExerciseDto })
  update(@Param() params: IdParamDto, @Body() body: ExerciseInputDto): Promise<Exercise> {
    return this.exercises.update(params.id, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @ApiOkResponse({ type: ExerciseDto })
  archive(@Param() params: IdParamDto): Promise<Exercise> {
    return this.exercises.setArchived(params.id, true);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @ApiOkResponse({ type: ExerciseDto })
  restore(@Param() params: IdParamDto): Promise<Exercise> {
    return this.exercises.setArchived(params.id, false);
  }
}
