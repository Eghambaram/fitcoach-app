import { Controller, Get, Param, Post, StreamableFile } from "@nestjs/common";
import { ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import {
  type DataExport,
  type DataExportListResponse,
  dataExportListResponseSchema,
  dataExportSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Roles } from "../../common/auth/decorators";
import { ExportsService } from "./exports.service";

class DataExportDto extends createZodDto(dataExportSchema) {}
class DataExportListDto extends createZodDto(dataExportListResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Workspace data export (PROMPT §8.12). Trainer only; allowed while suspended (§16.0). */
@ApiTags("exports")
@Roles("trainer")
@AllowInactiveWorkspace()
@Controller("exports")
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get()
  @ApiOkResponse({ type: DataExportListDto })
  list(): Promise<DataExportListResponse> {
    return this.exports.list();
  }

  @Post()
  @ApiOkResponse({ type: DataExportDto })
  request(): Promise<DataExport> {
    return this.exports.request();
  }

  @Get(":id/download")
  @ApiProduces("application/zip")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async download(@Param() params: IdParamDto): Promise<StreamableFile> {
    const { body, filename } = await this.exports.download(params.id);
    return new StreamableFile(body, {
      type: "application/zip",
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
