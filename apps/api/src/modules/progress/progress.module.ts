import { Module } from "@nestjs/common";
import { ClientProgressController, ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";

@Module({
  controllers: [ProgressController, ClientProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
