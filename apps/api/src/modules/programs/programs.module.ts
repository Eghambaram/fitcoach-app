import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AssignmentsService } from "./assignments.service";
import { ProgramsController } from "./programs.controller";
import { ProgramsService } from "./programs.service";

@Module({
  controllers: [ProgramsController],
  providers: [ProgramsService, AssignmentsService, IdempotencyService],
  exports: [ProgramsService, AssignmentsService],
})
export class ProgramsModule {}
