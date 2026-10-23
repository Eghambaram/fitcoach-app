import { Module } from "@nestjs/common";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { LeadFollowUpsService } from "./lead-follow-ups.service";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadFollowUpsService, WhatsAppLinkBuilder],
})
export class LeadsModule {}
