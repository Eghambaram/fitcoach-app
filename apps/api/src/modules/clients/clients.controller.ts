import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type ClientDetail,
  clientDetailSchema,
  clientListQuerySchema,
  clientListResponseSchema,
  type ClientListResponse,
  clientNoteRequestSchema,
  clientOptionsResponseSchema,
  type ClientOptionsResponse,
  clientScheduleResponseSchema,
  type ClientScheduleResponse,
  clientStatusRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { AppointmentsService } from "../scheduling/appointments.service";
import { ClientsService } from "./clients.service";

class ClientListQueryDto extends createZodDto(clientListQuerySchema) {}
class ClientListResponseDto extends createZodDto(clientListResponseSchema) {}
class ClientDetailDto extends createZodDto(clientDetailSchema) {}
class ClientNoteRequestDto extends createZodDto(clientNoteRequestSchema) {}
class ClientStatusRequestDto extends createZodDto(clientStatusRequestSchema) {}
class ClientScheduleResponseDto extends createZodDto(clientScheduleResponseSchema) {}
class ClientOptionsResponseDto extends createZodDto(clientOptionsResponseSchema) {}
class ClientIdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Clients (PROMPT §8.3). The workspace comes from the session only (CLAUDE.md rule 1). */
@ApiTags("clients")
@Roles("trainer")
@Controller("clients")
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly appointments: AppointmentsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ClientListResponseDto })
  list(@Query() query: ClientListQueryDto): Promise<ClientListResponse> {
    return this.clients.list(query);
  }

  /** Picker for booking sessions. Declared before `:id`. */
  @Get("options")
  @ApiOkResponse({ type: ClientOptionsResponseDto })
  options(): Promise<ClientOptionsResponse> {
    return this.appointments.clientOptions();
  }

  @Get(":id")
  @ApiOkResponse({ type: ClientDetailDto })
  get(@Param() params: ClientIdParamDto): Promise<ClientDetail> {
    return this.clients.get(params.id);
  }

  @Get(":id/schedule")
  @ApiOkResponse({ type: ClientScheduleResponseDto })
  async schedule(@Param() params: ClientIdParamDto): Promise<ClientScheduleResponse> {
    await this.clients.get(params.id);
    return this.appointments.forClient(params.id);
  }

  @Post(":id/notes")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientDetailDto })
  addNote(
    @Param() params: ClientIdParamDto,
    @Body() body: ClientNoteRequestDto,
  ): Promise<ClientDetail> {
    return this.clients.addNote(params.id, body.body);
  }

  /** Pause, resume, archive (revokes portal access) or restore. */
  @Post(":id/status")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientDetailDto })
  changeStatus(
    @Param() params: ClientIdParamDto,
    @Body() body: ClientStatusRequestDto,
  ): Promise<ClientDetail> {
    return this.clients.changeStatus(params.id, body);
  }
}
