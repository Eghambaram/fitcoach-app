import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ProgramsModule } from "../programs/programs.module";
import { WorkoutsController } from "./workouts.controller";
import { WorkoutsService } from "./workouts.service";

@Module({
  imports: [ProgramsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, IdempotencyService],
})
export class WorkoutsModule {}
