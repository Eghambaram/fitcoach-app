import { Module } from "@nestjs/common";
import { AppointmentsController, ClientOptionsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { SessionDeductionService } from "./session-deduction.service";

@Module({
  controllers: [AppointmentsController, ClientOptionsController],
  providers: [AppointmentsService, SessionDeductionService],
  exports: [SessionDeductionService],
})
export class SchedulingModule {}
