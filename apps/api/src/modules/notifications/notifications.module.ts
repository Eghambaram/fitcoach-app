import { Module } from "@nestjs/common";
import { NotificationJobsService } from "./notification-jobs.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationJobsService],
  exports: [NotificationJobsService],
})
export class NotificationsModule {}
