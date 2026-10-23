import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  createOnboardingDraftRequestSchema,
  finalizeOnboardingRequestSchema,
  finalizeOnboardingResponseSchema,
  type FinalizeOnboardingResponse,
  type OnboardingDraft,
  onboardingDraftSchema,
  onboardingDraftsResponseSchema,
  type OnboardingDraftsResponse,
  onboardingFromLeadResponseSchema,
  type OnboardingFromLeadResponse,
  saveOnboardingDraftRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { OnboardingService } from "./onboarding.service";

class CreateDraftRequestDto extends createZodDto(createOnboardingDraftRequestSchema) {}
class SaveDraftRequestDto extends createZodDto(saveOnboardingDraftRequestSchema) {}
class DraftDto extends createZodDto(onboardingDraftSchema) {}
class DraftsResponseDto extends createZodDto(onboardingDraftsResponseSchema) {}
class FromLeadResponseDto extends createZodDto(onboardingFromLeadResponseSchema) {}
class FinalizeRequestDto extends createZodDto(finalizeOnboardingRequestSchema) {}
class FinalizeResponseDto extends createZodDto(finalizeOnboardingResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}
class LeadIdParamDto extends createZodDto(z.object({ leadId: z.string().uuid() })) {}

/** Add Client onboarding wizard (PROMPT §8.4). The workspace comes from the session only. */
@ApiTags("onboarding")
@Roles("trainer")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("drafts")
  @ApiOkResponse({ type: DraftsResponseDto })
  listDrafts(): Promise<OnboardingDraftsResponse> {
    return this.onboarding.listDrafts();
  }

  @Post("drafts")
  @HttpCode(201)
  @ApiOkResponse({ type: DraftDto })
  createDraft(@Body() body: CreateDraftRequestDto): Promise<OnboardingDraft> {
    return this.onboarding.createDraft(body);
  }

  @Get("drafts/:id")
  @ApiOkResponse({ type: DraftDto })
  getDraft(@Param() params: IdParamDto): Promise<OnboardingDraft> {
    return this.onboarding.getDraft(params.id);
  }

  @Put("drafts/:id")
  @ApiOkResponse({ type: DraftDto })
  saveDraft(
    @Param() params: IdParamDto,
    @Body() body: SaveDraftRequestDto,
  ): Promise<OnboardingDraft> {
    return this.onboarding.saveDraft(params.id, body);
  }

  /** `?fromLead=`: the converted client's open draft, a prefill, or "already onboarded". */
  @Get("from-lead/:leadId")
  @ApiOkResponse({ type: FromLeadResponseDto })
  fromLead(@Param() params: LeadIdParamDto): Promise<OnboardingFromLeadResponse> {
    return this.onboarding.fromLead(params.leadId);
  }

  /** Create Client: one transaction, Idempotency-Key. */
  @Post("finalize")
  @HttpCode(201)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: FinalizeResponseDto })
  finalize(
    @Body() body: FinalizeRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<FinalizeOnboardingResponse> {
    return this.onboarding.finalize(body, idempotencyKey);
  }
}
