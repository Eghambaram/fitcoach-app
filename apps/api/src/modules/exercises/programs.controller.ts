import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { type ProgramTemplatesResponse, programTemplatesResponseSchema } from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { Roles } from "../../common/auth/decorators";
import { ProgramsService } from "./programs.service";

class ProgramTemplatesResponseDto extends createZodDto(programTemplatesResponseSchema) {}

/** Starter templates, read-only (PROMPT §8.5). The builder's endpoints join this in step 3.4. */
@ApiTags("programs")
@Roles("trainer")
@Controller("programs")
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get("templates")
  @ApiOkResponse({ type: ProgramTemplatesResponseDto })
  templates(): Promise<ProgramTemplatesResponse> {
    return this.programs.templates();
  }
}
