import {
  checkInRulesSchema,
  localeSettingsSchema,
  messageTemplatePurposeSchema,
  messageTemplatesResponseSchema,
  messageTemplateUpdateSchema,
  packagePolicySchema,
  packagePresetInputSchema,
  packagePresetsResponseSchema,
  publicPageSettingsRequestSchema,
  publicPageSettingsResponseSchema,
  publishRequestSchema,
  QR_FORMATS,
  workspaceSettingsResponseSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class PublicPageSettingsRequestDto extends createZodDto(publicPageSettingsRequestSchema) {}
export class PublicPageSettingsResponseDto extends createZodDto(publicPageSettingsResponseSchema) {}
export class PublishRequestDto extends createZodDto(publishRequestSchema) {}
export class QrQueryDto extends createZodDto(
  z.object({ format: z.enum(QR_FORMATS).default("png") }),
) {}

export class WorkspaceSettingsResponseDto extends createZodDto(workspaceSettingsResponseSchema) {}
export class LocaleSettingsDto extends createZodDto(localeSettingsSchema) {}
export class CheckInRulesDto extends createZodDto(checkInRulesSchema) {}
export class PackagePolicyDto extends createZodDto(packagePolicySchema) {}

export class MessageTemplatesResponseDto extends createZodDto(messageTemplatesResponseSchema) {}
export class MessageTemplateUpdateDto extends createZodDto(messageTemplateUpdateSchema) {}
export class TemplatePurposeParamDto extends createZodDto(
  z.object({ purpose: messageTemplatePurposeSchema }),
) {}

export class PackagePresetInputDto extends createZodDto(packagePresetInputSchema) {}
export class PackagePresetsResponseDto extends createZodDto(packagePresetsResponseSchema) {}
export class PresetIdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}
