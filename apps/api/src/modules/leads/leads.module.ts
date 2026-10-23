import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { LeadConversionService } from "./lead-conversion.service";
import { LeadFollowUpsService } from "./lead-follow-ups.service";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  controllers: [LeadsController],
  providers: [
    LeadsService,
    LeadFollowUpsService,
    LeadConversionService,
    IdempotencyService,
    WhatsAppLinkBuilder,
  ],
})
export class LeadsModule {}
