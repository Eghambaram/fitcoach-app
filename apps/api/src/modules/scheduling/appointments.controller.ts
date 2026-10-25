import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type AppointmentDetail,
  appointmentDetailSchema,
  appointmentListQuerySchema,
  appointmentListResponseSchema,
  type AppointmentListResponse,
  attendanceRequestSchema,
  cancelAppointmentRequestSchema,
  clientOptionsResponseSchema,
  type ClientOptionsResponse,
  createAppointmentRequestSchema,
  needsAttendanceResponseSchema,
  type NeedsAttendanceResponse,
  seriesCreatedResponseSchema,
  type SeriesCreatedResponse,
  seriesPreviewResponseSchema,
  type SeriesPreviewResponse,
  seriesRequestSchema,
  sessionNotesRequestSchema,
  updateAppointmentRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { AppointmentsService } from "./appointments.service";

class ListQueryDto extends createZodDto(appointmentListQuerySchema) {}
class ListResponseDto extends createZodDto(appointmentListResponseSchema) {}
class NeedsAttendanceResponseDto extends createZodDto(needsAttendanceResponseSchema) {}
class DetailDto extends createZodDto(appointmentDetailSchema) {}
class CreateRequestDto extends createZodDto(createAppointmentRequestSchema) {}
class UpdateRequestDto extends createZodDto(updateAppointmentRequestSchema) {}
class CancelRequestDto extends createZodDto(cancelAppointmentRequestSchema) {}
class AttendanceRequestDto extends createZodDto(attendanceRequestSchema) {}
class NotesRequestDto extends createZodDto(sessionNotesRequestSchema) {}
class SeriesRequestDto extends createZodDto(seriesRequestSchema) {}
class SeriesPreviewResponseDto extends createZodDto(seriesPreviewResponseSchema) {}
class SeriesCreatedResponseDto extends createZodDto(seriesCreatedResponseSchema) {}
class ClientOptionsResponseDto extends createZodDto(clientOptionsResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Calendar (PROMPT §8.6). The workspace comes from the session only (CLAUDE.md rule 1). */
@ApiTags("appointments")
@Roles("trainer")
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOkResponse({ type: ListResponseDto })
  list(@Query() query: ListQueryDto): Promise<AppointmentListResponse> {
    return this.appointments.list(query);
  }

  @Get("needs-attendance")
  @ApiOkResponse({ type: NeedsAttendanceResponseDto })
  needsAttendance(): Promise<NeedsAttendanceResponse> {
    return this.appointments.needsAttendance();
  }

  @Post()
  @HttpCode(201)
  @ApiOkResponse({ type: DetailDto })
  create(@Body() body: CreateRequestDto): Promise<AppointmentDetail> {
    return this.appointments.create(body);
  }

  /** Dates and conflicts of a series before it is saved. */
  @Post("series/preview")
  @HttpCode(200)
  @ApiOkResponse({ type: SeriesPreviewResponseDto })
  previewSeries(@Body() body: SeriesRequestDto): Promise<SeriesPreviewResponse> {
    return this.appointments.previewSeries(body);
  }

  @Post("series")
  @HttpCode(201)
  @ApiOkResponse({ type: SeriesCreatedResponseDto })
  createSeries(@Body() body: SeriesRequestDto): Promise<SeriesCreatedResponse> {
    return this.appointments.createSeries(body);
  }

  @Get(":id")
  @ApiOkResponse({ type: DetailDto })
  get(@Param() params: IdParamDto): Promise<AppointmentDetail> {
    return this.appointments.get(params.id);
  }

  @Patch(":id")
  @ApiOkResponse({ type: DetailDto })
  update(@Param() params: IdParamDto, @Body() body: UpdateRequestDto): Promise<AppointmentDetail> {
    return this.appointments.update(params.id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @ApiOkResponse({ type: DetailDto })
  cancel(@Param() params: IdParamDto, @Body() body: CancelRequestDto): Promise<AppointmentDetail> {
    return this.appointments.cancel(params.id, body);
  }

  @Post(":id/attendance")
  @HttpCode(200)
  @ApiOkResponse({ type: DetailDto })
  attendance(
    @Param() params: IdParamDto,
    @Body() body: AttendanceRequestDto,
  ): Promise<AppointmentDetail> {
    return this.appointments.attendance(params.id, body);
  }

  @Put(":id/notes")
  @ApiOkResponse({ type: DetailDto })
  notes(@Param() params: IdParamDto, @Body() body: NotesRequestDto): Promise<AppointmentDetail> {
    return this.appointments.notes(params.id, body);
  }
}

/** Client picker for booking; the clients screen itself is step 3.1. */
@ApiTags("clients")
@Roles("trainer")
@Controller("clients")
export class ClientOptionsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get("options")
  @ApiOkResponse({ type: ClientOptionsResponseDto })
  options(): Promise<ClientOptionsResponse> {
    return this.appointments.clientOptions();
  }
}
