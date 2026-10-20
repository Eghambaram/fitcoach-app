import { Global, Module } from "@nestjs/common";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionsService } from "./sessions.service";

/** Global so the app-wide SessionGuard can resolve sessions. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService, RateLimitService],
  exports: [SessionsService, RateLimitService],
})
export class AuthModule {}
