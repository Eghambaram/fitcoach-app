import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";
import { NightlyBackupService } from "./nightly-backup.service";

@Module({
  imports: [AuthModule],
  controllers: [BackupsController],
  providers: [BackupsService, NightlyBackupService],
  exports: [BackupsService, NightlyBackupService],
})
export class BackupsModule {}
