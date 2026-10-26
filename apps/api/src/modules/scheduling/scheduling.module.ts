import { Module } from "@nestjs/common";
import { PackagesModule } from "../packages/packages.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { SessionDeductionService } from "./session-deduction.service";

@Module({
  imports: [PackagesModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, SessionDeductionService],
  exports: [AppointmentsService, SessionDeductionService],
})
export class SchedulingModule {}
