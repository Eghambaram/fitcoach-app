import { Module } from "@nestjs/common";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { SessionDeductionService } from "./session-deduction.service";

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, SessionDeductionService],
  exports: [AppointmentsService, SessionDeductionService],
})
export class SchedulingModule {}
