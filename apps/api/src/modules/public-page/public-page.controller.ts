import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  enquiryRequestSchema,
  okResponseSchema,
  type OkResponse,
  type PublicPageResponse,
  publicPageResponseSchema,
} from "@fitcoach/shared";
import type { Request } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Public } from "../../common/auth/decorators";
import { requestMeta } from "../../common/security/request-meta";
import { AppConfig } from "../../config/env";
import { SkipDbContext } from "../../db/db-context";
import { PublicPageService } from "./public-page.service";

class EnquiryRequestDto extends createZodDto(enquiryRequestSchema) {}
class PublicPageResponseDto extends createZodDto(publicPageResponseSchema) {}
class EnquiryResponseDto extends createZodDto(okResponseSchema) {}
class SlugParamDto extends createZodDto(
  z.object({ slug: z.string().trim().toLowerCase().min(3).max(40) }),
) {}

/**
 * Anonymous endpoints for the public enquiry page (PROMPT §8.2). Both are rate-limited in the
 * service and use SystemDb only, so no request transaction is opened.
 */
@ApiTags("public")
@Public()
@SkipDbContext()
@Controller("public")
export class PublicPageController {
  constructor(
    private readonly pages: PublicPageService,
    private readonly config: AppConfig,
  ) {}

  @Get("pages/:slug")
  @ApiOkResponse({ type: PublicPageResponseDto })
  getPage(@Param() params: SlugParamDto, @Req() request: Request): Promise<PublicPageResponse> {
    return this.pages.getPublishedPage(params.slug, requestMeta(request, this.config.ipHashSalt));
  }

  @Post("enquiries")
  @HttpCode(200)
  @ApiOkResponse({ type: EnquiryResponseDto })
  async submit(@Body() body: EnquiryRequestDto, @Req() request: Request): Promise<OkResponse> {
    await this.pages.submitEnquiry(body, requestMeta(request, this.config.ipHashSalt));
    return { ok: true };
  }
}
