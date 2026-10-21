import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import type {
  MessageTemplatesResponse,
  PackagePresetsResponse,
  PublicPageSettingsResponse,
  WorkspaceSettingsResponse,
} from "@fitcoach/shared";
import { Roles } from "../../common/auth/decorators";
import {
  CheckInRulesDto,
  LocaleSettingsDto,
  MessageTemplatesResponseDto,
  MessageTemplateUpdateDto,
  PackagePolicyDto,
  PackagePresetInputDto,
  PackagePresetsResponseDto,
  PresetIdParamDto,
  PublicPageSettingsRequestDto,
  PublicPageSettingsResponseDto,
  PublishRequestDto,
  QrQueryDto,
  TemplatePurposeParamDto,
  WorkspaceSettingsResponseDto,
} from "./settings.dto";
import { SettingsService } from "./settings.service";

/** Trainer settings (PROMPT §8.12). Workspace identity comes from the session only (CLAUDE.md rule 1). */
@ApiTags("settings")
@Roles("trainer")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  getWorkspaceSettings(): Promise<WorkspaceSettingsResponse> {
    return this.settings.getWorkspaceSettings();
  }

  @Put("locale")
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  updateLocale(@Body() body: LocaleSettingsDto): Promise<WorkspaceSettingsResponse> {
    return this.settings.updateLocale(body);
  }

  @Put("check-ins")
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  updateCheckIns(@Body() body: CheckInRulesDto): Promise<WorkspaceSettingsResponse> {
    return this.settings.updateCheckIns(body);
  }

  @Put("package-policy")
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  updatePackagePolicy(@Body() body: PackagePolicyDto): Promise<WorkspaceSettingsResponse> {
    return this.settings.updatePackagePolicy(body);
  }

  // Profile & public page -----------------------------------------------------------------------

  @Get("public-page")
  @ApiOkResponse({ type: PublicPageSettingsResponseDto })
  getPublicPage(): Promise<PublicPageSettingsResponse> {
    return this.settings.getPublicPage();
  }

  @Put("public-page")
  @ApiOkResponse({ type: PublicPageSettingsResponseDto })
  updatePublicPage(
    @Body() body: PublicPageSettingsRequestDto,
  ): Promise<PublicPageSettingsResponse> {
    return this.settings.updatePublicPage(body);
  }

  @Post("public-page/publish")
  @HttpCode(200)
  @ApiOkResponse({ type: PublicPageSettingsResponseDto })
  setPublished(@Body() body: PublishRequestDto): Promise<PublicPageSettingsResponse> {
    return this.settings.setPublished(body.published);
  }

  @Get("public-page/qr")
  @ApiProduces("image/png", "image/svg+xml")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async qrCode(@Query() query: QrQueryDto): Promise<StreamableFile> {
    const { data, slug } = await this.settings.qrCode(query.format);
    return new StreamableFile(data, {
      type: query.format === "png" ? "image/png" : "image/svg+xml",
      disposition: `attachment; filename="fitcoach-${slug}-qr.${query.format}"`,
    });
  }

  // Message templates ---------------------------------------------------------------------------

  @Get("message-templates")
  @ApiOkResponse({ type: MessageTemplatesResponseDto })
  listTemplates(): Promise<MessageTemplatesResponse> {
    return this.settings.listTemplates();
  }

  @Put("message-templates/:purpose")
  @ApiOkResponse({ type: MessageTemplatesResponseDto })
  updateTemplate(
    @Param() params: TemplatePurposeParamDto,
    @Body() body: MessageTemplateUpdateDto,
  ): Promise<MessageTemplatesResponse> {
    return this.settings.updateTemplate(params.purpose, body.body);
  }

  @Post("message-templates/:purpose/reset")
  @HttpCode(200)
  @ApiOkResponse({ type: MessageTemplatesResponseDto })
  resetTemplate(@Param() params: TemplatePurposeParamDto): Promise<MessageTemplatesResponse> {
    return this.settings.resetTemplate(params.purpose);
  }

  // Package presets -----------------------------------------------------------------------------

  @Get("package-presets")
  @ApiOkResponse({ type: PackagePresetsResponseDto })
  listPresets(): Promise<PackagePresetsResponse> {
    return this.settings.listPresets();
  }

  @Post("package-presets")
  @HttpCode(200)
  @ApiOkResponse({ type: PackagePresetsResponseDto })
  createPreset(@Body() body: PackagePresetInputDto): Promise<PackagePresetsResponse> {
    return this.settings.createPreset(body);
  }

  @Put("package-presets/:id")
  @ApiOkResponse({ type: PackagePresetsResponseDto })
  updatePreset(
    @Param() params: PresetIdParamDto,
    @Body() body: PackagePresetInputDto,
  ): Promise<PackagePresetsResponse> {
    return this.settings.updatePreset(params.id, body);
  }

  @Post("package-presets/:id/archive")
  @HttpCode(200)
  @ApiOkResponse({ type: PackagePresetsResponseDto })
  archivePreset(@Param() params: PresetIdParamDto): Promise<PackagePresetsResponse> {
    return this.settings.setPresetArchived(params.id, true);
  }

  @Post("package-presets/:id/restore")
  @HttpCode(200)
  @ApiOkResponse({ type: PackagePresetsResponseDto })
  restorePreset(@Param() params: PresetIdParamDto): Promise<PackagePresetsResponse> {
    return this.settings.setPresetArchived(params.id, false);
  }
}
