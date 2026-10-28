import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BackupsModule } from "../backups/backups.module";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformController } from "./platform.controller";
import { PlatformOpsService } from "./platform-ops.service";
import { PlatformTrainersService } from "./platform-trainers.service";

@Module({
  imports: [AuthModule, BackupsModule],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformAuthService, PlatformTrainersService, PlatformOpsService],
})
export class PlatformModule {}
