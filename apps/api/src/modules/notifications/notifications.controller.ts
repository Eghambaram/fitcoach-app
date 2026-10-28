import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { type NotificationListResponse, notificationListResponseSchema } from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Roles } from "../../common/auth/decorators";
import { NotificationsService } from "./notifications.service";

class NotificationListDto extends createZodDto(notificationListResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** The bell (PROMPT §8.10), for trainers and clients. Marking read is allowed even when suspended. */
@ApiTags("notifications")
@Roles("trainer", "client")
@AllowInactiveWorkspace()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationListDto })
  list(): Promise<NotificationListResponse> {
    return this.notifications.list();
  }

  @Post("read-all")
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationListDto })
  readAll(): Promise<NotificationListResponse> {
    return this.notifications.markAllRead();
  }

  @Post(":id/read")
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationListDto })
  read(@Param() params: IdParamDto): Promise<NotificationListResponse> {
    return this.notifications.markRead(params.id);
  }
}
