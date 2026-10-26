import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { PackagesController } from "./packages.controller";
import { PackagesService } from "./packages.service";

@Module({
  controllers: [PackagesController],
  providers: [PackagesService, IdempotencyService],
  exports: [PackagesService],
})
export class PackagesModule {}
