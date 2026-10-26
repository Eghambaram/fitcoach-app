import { Module } from "@nestjs/common";
import { PackagesModule } from "../packages/packages.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [SchedulingModule, PackagesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
