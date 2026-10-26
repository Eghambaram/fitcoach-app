import { Module } from "@nestjs/common";
import { ExercisesController } from "./exercises.controller";
import { ExercisesService } from "./exercises.service";
import { ProgramsController } from "./programs.controller";
import { ProgramsService } from "./programs.service";

@Module({
  controllers: [ExercisesController, ProgramsController],
  providers: [ExercisesService, ProgramsService],
  exports: [ExercisesService, ProgramsService],
})
export class ExercisesModule {}
