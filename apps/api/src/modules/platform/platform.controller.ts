import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { OkResponse } from "@fitcoach/shared";
import { Roles } from "../../common/auth/decorators";
import { SkipDbContext } from "../../db/db-context";
import { OkResponseDto } from "../auth/auth.dto";

/**
 * Platform owner area (PROMPT §16.0). This step only exposes the access check the /platform layout
 * relies on: a trainer or client is refused here by the API, not just hidden in the UI.
 * The platform login, mandatory TOTP (PlatformMfaGuard) and the admin endpoints arrive in step 6.1.
 */
@ApiTags("platform")
@Roles("platform_owner")
@SkipDbContext()
@Controller("platform")
export class PlatformController {
  @Get("access")
  @ApiOkResponse({ type: OkResponseDto })
  access(): OkResponse {
    return { ok: true };
  }
}
