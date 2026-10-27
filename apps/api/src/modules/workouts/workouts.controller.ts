import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  addWorkoutExerciseRequestSchema,
  finishWorkoutRequestSchema,
  putWorkoutSetRequestSchema,
  skipWorkoutRequestSchema,
  substituteExerciseRequestSchema,
  type WorkoutDetail,
  workoutDetailSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { WorkoutsService } from "./workouts.service";

class WorkoutDetailDto extends createZodDto(workoutDetailSchema) {}
class PutWorkoutSetRequestDto extends createZodDto(putWorkoutSetRequestSchema) {}
class SubstituteExerciseRequestDto extends createZodDto(substituteExerciseRequestSchema) {}
class AddWorkoutExerciseRequestDto extends createZodDto(addWorkoutExerciseRequestSchema) {}
class FinishWorkoutRequestDto extends createZodDto(finishWorkoutRequestSchema) {}
class SkipWorkoutRequestDto extends createZodDto(skipWorkoutRequestSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/**
 * Live workout logging (PROMPT §8.5). Trainer only for now; the client app (step 4.2) reuses the
 * same flow when self-logging is enabled.
 */
@ApiTags("workouts")
@Roles("trainer")
@Controller()
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  /** Read only: opening a workout never starts or completes anything. */
  @Get("workout-sessions/:id")
  @ApiOkResponse({ type: WorkoutDetailDto })
  get(@Param() params: IdParamDto): Promise<WorkoutDetail> {
    return this.workouts.get(params.id);
  }

  @Post("workout-sessions/:id/start")
  @HttpCode(200)
  @ApiOkResponse({ type: WorkoutDetailDto })
  start(@Param() params: IdParamDto): Promise<WorkoutDetail> {
    return this.workouts.start(params.id);
  }

  /** Idempotent upsert of one set; the id is generated on the device. */
  @Put("workout-sets/:id")
  @ApiOkResponse({ type: WorkoutDetailDto })
  putSet(
    @Param() params: IdParamDto,
    @Body() body: PutWorkoutSetRequestDto,
  ): Promise<WorkoutDetail> {
    return this.workouts.putSet(params.id, body);
  }

  @Post("workout-session-exercises/:id/substitute")
  @HttpCode(200)
  @ApiOkResponse({ type: WorkoutDetailDto })
  substitute(
    @Param() params: IdParamDto,
    @Body() body: SubstituteExerciseRequestDto,
  ): Promise<WorkoutDetail> {
    return this.workouts.substitute(params.id, body);
  }

  @Post("workout-sessions/:id/exercises")
  @HttpCode(200)
  @ApiOkResponse({ type: WorkoutDetailDto })
  addExercise(
    @Param() params: IdParamDto,
    @Body() body: AddWorkoutExerciseRequestDto,
  ): Promise<WorkoutDetail> {
    return this.workouts.addExercise(params.id, body);
  }

  @Post("workout-sessions/:id/finish")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: WorkoutDetailDto })
  finish(
    @Param() params: IdParamDto,
    @Body() body: FinishWorkoutRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<WorkoutDetail> {
    return this.workouts.finish(params.id, body, idempotencyKey);
  }

  @Post("workout-sessions/:id/skip")
  @HttpCode(200)
  @ApiOkResponse({ type: WorkoutDetailDto })
  skip(@Param() params: IdParamDto, @Body() body: SkipWorkoutRequestDto): Promise<WorkoutDetail> {
    return this.workouts.skip(params.id, body);
  }
}
