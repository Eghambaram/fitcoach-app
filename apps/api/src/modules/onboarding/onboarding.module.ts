import { Module } from "@nestjs/common";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { PackagesModule } from "../packages/packages.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [PackagesModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, IdempotencyService],
})
export class OnboardingModule {}
