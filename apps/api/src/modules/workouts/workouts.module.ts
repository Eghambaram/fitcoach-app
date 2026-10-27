import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { WorkoutsController } from "./workouts.controller";
import { WorkoutsService } from "./workouts.service";

@Module({
  exports: [WorkoutsService],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, IdempotencyService],
})
export class WorkoutsModule {}
