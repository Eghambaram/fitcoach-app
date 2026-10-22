import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import {
  changeLeadStageRequestSchema,
  createLeadRequestSchema,
  duplicateCheckRequestSchema,
  duplicateCheckResponseSchema,
  type DuplicateCheckResponse,
  LEAD_STAGES,
  leadDetailResponseSchema,
  type LeadDetailResponse,
  leadFiltersSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  type LeadListResponse,
  leadNoteRequestSchema,
  leadsSummaryResponseSchema,
  type LeadsSummaryResponse,
  type OkResponse,
  updateLeadRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { OkResponseDto } from "../auth/auth.dto";
import { LeadsService } from "./leads.service";

class LeadListQueryDto extends createZodDto(leadListQuerySchema) {}
class LeadFiltersDto extends createZodDto(leadFiltersSchema) {}
class LeadExportQueryDto extends createZodDto(
  leadFiltersSchema.extend({ stage: z.enum(LEAD_STAGES).optional() }),
) {}
class LeadListResponseDto extends createZodDto(leadListResponseSchema) {}
class LeadsSummaryResponseDto extends createZodDto(leadsSummaryResponseSchema) {}
class CreateLeadRequestDto extends createZodDto(createLeadRequestSchema) {}
class UpdateLeadRequestDto extends createZodDto(updateLeadRequestSchema) {}
class ChangeLeadStageRequestDto extends createZodDto(changeLeadStageRequestSchema) {}
class LeadNoteRequestDto extends createZodDto(leadNoteRequestSchema) {}
class LeadDetailResponseDto extends createZodDto(leadDetailResponseSchema) {}
class DuplicateCheckRequestDto extends createZodDto(duplicateCheckRequestSchema) {}
class DuplicateCheckResponseDto extends createZodDto(duplicateCheckResponseSchema) {}
class LeadIdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Lead CRM (PROMPT §8.2). The workspace comes from the session only (CLAUDE.md rule 1). */
@ApiTags("leads")
@Roles("trainer")
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOkResponse({ type: LeadListResponseDto })
  list(@Query() query: LeadListQueryDto): Promise<LeadListResponse> {
    return this.leads.list(query);
  }

  @Get("summary")
  @ApiOkResponse({ type: LeadsSummaryResponseDto })
  summary(@Query() query: LeadFiltersDto): Promise<LeadsSummaryResponse> {
    return this.leads.summary(query);
  }

  /** Allowed while suspended too (read-only, export allowed — §16.0). */
  @Get("export.csv")
  @ApiProduces("text/csv")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async exportCsv(@Query() query: LeadExportQueryDto): Promise<StreamableFile> {
    const csv = await this.leads.exportCsv(query);
    const day = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, "utf8"), {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="leads-${day}.csv"`,
    });
  }

  @Post("duplicates")
  @HttpCode(200)
  @ApiOkResponse({ type: DuplicateCheckResponseDto })
  duplicates(@Body() body: DuplicateCheckRequestDto): Promise<DuplicateCheckResponse> {
    return this.leads.duplicates(body);
  }

  @Post()
  @HttpCode(201)
  @ApiOkResponse({ type: LeadDetailResponseDto })
  create(@Body() body: CreateLeadRequestDto): Promise<LeadDetailResponse> {
    return this.leads.create(body);
  }

  @Get(":id")
  @ApiOkResponse({ type: LeadDetailResponseDto })
  get(@Param() params: LeadIdParamDto): Promise<LeadDetailResponse> {
    return this.leads.get(params.id);
  }

  @Patch(":id")
  @ApiOkResponse({ type: LeadDetailResponseDto })
  update(
    @Param() params: LeadIdParamDto,
    @Body() body: UpdateLeadRequestDto,
  ): Promise<LeadDetailResponse> {
    return this.leads.update(params.id, body);
  }

  @Post(":id/stage")
  @HttpCode(200)
  @ApiOkResponse({ type: LeadDetailResponseDto })
  changeStage(
    @Param() params: LeadIdParamDto,
    @Body() body: ChangeLeadStageRequestDto,
  ): Promise<LeadDetailResponse> {
    return this.leads.changeStage(params.id, body);
  }

  @Post(":id/notes")
  @HttpCode(200)
  @ApiOkResponse({ type: LeadDetailResponseDto })
  addNote(
    @Param() params: LeadIdParamDto,
    @Body() body: LeadNoteRequestDto,
  ): Promise<LeadDetailResponse> {
    return this.leads.addNote(params.id, body.body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @ApiOkResponse({ type: LeadDetailResponseDto })
  archive(@Param() params: LeadIdParamDto): Promise<LeadDetailResponse> {
    return this.leads.setArchived(params.id, true);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @ApiOkResponse({ type: LeadDetailResponseDto })
  restore(@Param() params: LeadIdParamDto): Promise<LeadDetailResponse> {
    return this.leads.setArchived(params.id, false);
  }

  @Delete(":id")
  @ApiOkResponse({ type: OkResponseDto })
  async remove(@Param() params: LeadIdParamDto): Promise<OkResponse> {
    await this.leads.remove(params.id);
    return { ok: true };
  }
}
