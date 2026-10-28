import { Module } from "@nestjs/common";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, WhatsAppLinkBuilder],
})
export class DashboardModule {}
