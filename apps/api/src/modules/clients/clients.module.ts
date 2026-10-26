import { Module } from "@nestjs/common";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [SchedulingModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
