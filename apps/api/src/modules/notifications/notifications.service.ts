import { Injectable } from "@nestjs/common";
import {
  NOTIFICATION_PAGE_SIZE,
  type NotificationListResponse,
  type NotificationType,
} from "@fitcoach/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { notifications } from "../../db/schema";

/**
 * The signed-in user's notifications (PROMPT §8.10): trainers and clients alike. RLS limits rows to
 * the recipient in their current workspace; queries filter the same way.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private scope() {
    const auth = this.cls.get("auth");
    if (!auth || !auth.workspaceId || (auth.actor !== "trainer" && auth.actor !== "client")) {
      throw DomainError.forbidden();
    }
    return and(
      eq(notifications.recipientUserId, auth.userId),
      eq(notifications.workspaceId, auth.workspaceId),
    );
  }

  async list(): Promise<NotificationListResponse> {
    const mine = this.scope();
    const rows = await this.db.tx
      .select()
      .from(notifications)
      .where(mine)
      .orderBy(desc(notifications.createdAt))
      .limit(NOTIFICATION_PAGE_SIZE);
    const [unread] = await this.db.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(mine, isNull(notifications.readAt)));
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type as NotificationType,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount: unread?.count ?? 0,
    };
  }

  async markRead(id: string): Promise<NotificationListResponse> {
    const updated = await this.db.tx
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(this.scope(), eq(notifications.id, id)))
      .returning({ id: notifications.id });
    if (updated.length === 0) throw DomainError.notFound("That notification doesn't exist.");
    return this.list();
  }

  async markAllRead(): Promise<NotificationListResponse> {
    await this.db.tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(this.scope(), isNull(notifications.readAt)));
    return this.list();
  }
}
