import { Module } from "@nestjs/common";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { CheckInsController, ClientCheckInController } from "./check-ins.controller";
import { CheckInsService } from "./check-ins.service";

@Module({
  controllers: [CheckInsController, ClientCheckInController],
  providers: [CheckInsService, WhatsAppLinkBuilder],
  exports: [CheckInsService],
})
export class CheckInsModule {}
