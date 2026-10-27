import { Injectable } from "@nestjs/common";
import { type ClientMeResponse, firstName } from "@fitcoach/shared";
import { and, eq } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { clients, files, profiles, workspaceMembers, workspaces } from "../../db/schema";
import { FilesService } from "../files/files.service";

const WRITABLE = new Set(["trialing", "active", "past_due"]);

/**
 * The client portal's own reads (PROMPT §9). Runs as fitcoach_app with the client's context, so
 * RLS shows only their client row, workspace and trainer; queries still filter by the session's
 * client and select allow-listed columns only (never limitations, attribution or notes).
 */
@Injectable()
export class ClientPortalService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly files: FilesService,
  ) {}

  scope(): { userId: string; clientId: string; workspaceId: string } {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "client" || !auth.clientId || !auth.workspaceId) {
      throw DomainError.forbidden();
    }
    return { userId: auth.userId, clientId: auth.clientId, workspaceId: auth.workspaceId };
  }

  async me(): Promise<ClientMeResponse> {
    const scope = this.scope();
    const [row] = await this.db.tx
      .select({
        id: clients.id,
        fullName: clients.fullName,
        workspaceName: workspaces.name,
        timezone: workspaces.timezone,
        workspaceStatus: workspaces.status,
      })
      .from(clients)
      .innerJoin(workspaces, eq(workspaces.id, clients.workspaceId))
      .where(and(eq(clients.id, scope.clientId), eq(clients.workspaceId, scope.workspaceId)));
    if (!row) throw DomainError.forbidden();
    const [trainer] = await this.db.tx
      .select({ displayName: profiles.displayName, avatarKey: files.objectKey })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.userId, workspaceMembers.userId))
      .leftJoin(files, eq(files.id, profiles.avatarFileId))
      .where(eq(workspaceMembers.workspaceId, scope.workspaceId))
      .limit(1);
    return {
      client: { id: row.id, fullName: row.fullName, firstName: firstName(row.fullName) },
      trainer: {
        displayName: trainer?.displayName ?? row.workspaceName,
        avatarUrl: this.files.avatarUrl(trainer?.avatarKey ?? null),
      },
      workspace: {
        name: row.workspaceName,
        timezone: row.timezone,
        readOnly: !WRITABLE.has(row.workspaceStatus),
      },
    };
  }
}
