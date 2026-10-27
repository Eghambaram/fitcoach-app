import { Module } from "@nestjs/common";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { AuthModule } from "../auth/auth.module";
import { WorkoutsModule } from "../workouts/workouts.module";
import { FilesModule } from "../files/files.module";
import {
  ClientAuthController,
  ClientPortalController,
  PortalAccessController,
} from "./client-portal.controller";
import { ClientAuthService } from "./client-auth.service";
import { ClientPortalService } from "./client-portal.service";
import { PortalAccessService } from "./portal-access.service";

@Module({
  imports: [AuthModule, FilesModule, WorkoutsModule],
  controllers: [PortalAccessController, ClientAuthController, ClientPortalController],
  providers: [PortalAccessService, ClientAuthService, ClientPortalService, WhatsAppLinkBuilder],
})
export class ClientPortalModule {}
