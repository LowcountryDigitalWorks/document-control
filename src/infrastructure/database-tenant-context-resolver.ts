import type { DatabaseProvider } from "../application/ports";
import {
  TenantContextDeniedError,
  type TenantContext,
  type TenantContextResolver,
} from "../application/tenant-context";

interface MembershipRow {
  membershipId: string;
}

interface WorkspaceRow {
  workspaceId: string;
}

export class DatabaseTenantContextResolver implements TenantContextResolver {
  public constructor(private readonly database: DatabaseProvider) {}

  public async resolve(
    subjectId: string,
    tenantId: string,
    workspaceId?: string,
  ): Promise<TenantContext> {
    const [membership] = await this.database.query<MembershipRow>(
      `SELECT id AS membershipId
       FROM tenant_memberships
       WHERE tenant_id = ? AND subject_id = ? AND status = 'active'`,
      [tenantId, subjectId],
    );
    if (!membership) throw new TenantContextDeniedError();

    if (workspaceId !== undefined) {
      const [workspace] = await this.database.query<WorkspaceRow>(
        `SELECT id AS workspaceId
         FROM workspaces
         WHERE tenant_id = ? AND id = ?`,
        [tenantId, workspaceId],
      );
      if (!workspace) throw new TenantContextDeniedError();
      return { subjectId, tenantId, workspaceId: workspace.workspaceId };
    }

    return { subjectId, tenantId };
  }
}
