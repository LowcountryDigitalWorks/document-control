import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
  type Permission,
} from "../application/authorization";
import type { DatabaseProvider } from "../application/ports";

interface PermissionRow {
  permissionsJson: string;
}

interface WorkspaceRow {
  workspaceId: string;
}

export class DatabaseAuthorizationPolicy implements AuthorizationPolicy {
  public constructor(private readonly database: DatabaseProvider) {}

  public async assertAllowed(request: AuthorizationRequest): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(request);
    const rows = await this.database.query<PermissionRow>(
      `SELECT role.permissions_json AS permissionsJson
       FROM role_bindings AS binding
       JOIN role_definitions AS role
         ON role.id = binding.role_definition_id
       LEFT JOIN tenant_memberships AS membership
         ON membership.tenant_id = binding.tenant_id
        AND membership.subject_id = binding.subject_id
        AND membership.status = 'active'
       WHERE binding.subject_id = ?
         AND (
           (
             role.scope = 'platform'
             AND role.tenant_id IS NULL
             AND binding.tenant_id IS NULL
             AND binding.workspace_id IS NULL
           )
           OR
           (
             role.scope = 'tenant'
             AND (role.tenant_id IS NULL OR role.tenant_id = ?)
             AND binding.tenant_id = ?
             AND binding.workspace_id IS NULL
             AND membership.id IS NOT NULL
           )
           OR
           (
             role.scope = 'workspace'
             AND (role.tenant_id IS NULL OR role.tenant_id = ?)
             AND binding.tenant_id = ?
             AND binding.workspace_id = ?
             AND membership.id IS NOT NULL
           )
         )`,
      [
        request.subjectId,
        request.tenantId,
        request.tenantId,
        request.tenantId,
        request.tenantId,
        workspaceId,
      ],
    );

    if (
      rows.some((row) =>
        permissionListAllows(parsePermissionList(row.permissionsJson), request.permission),
      )
    ) {
      return;
    }

    throw new AuthorizationDeniedError();
  }

  private async resolveWorkspaceId(
    request: AuthorizationRequest,
  ): Promise<string | null> {
    const resourceCount = [
      request.workspaceId,
      request.documentId,
      request.workflowInstanceId,
    ].filter((value) => value !== undefined).length;

    if (resourceCount > 1) {
      throw new Error("Authorization requests must identify at most one resource scope.");
    }

    if (request.workspaceId) {
      const [workspace] = await this.database.query<WorkspaceRow>(
        `SELECT id AS workspaceId
         FROM workspaces
         WHERE tenant_id = ? AND id = ?`,
        [request.tenantId, request.workspaceId],
      );
      if (!workspace) {
        throw new AuthorizationDeniedError();
      }
      return workspace.workspaceId;
    }

    if (request.documentId) {
      const [document] = await this.database.query<WorkspaceRow>(
        `SELECT workspace_id AS workspaceId
         FROM documents
         WHERE tenant_id = ? AND id = ?`,
        [request.tenantId, request.documentId],
      );
      if (!document) {
        throw new AuthorizationDeniedError();
      }
      return document.workspaceId;
    }

    if (request.workflowInstanceId) {
      const [workflow] = await this.database.query<WorkspaceRow>(
        `SELECT document.workspace_id AS workspaceId
         FROM workflow_instances AS instance
         JOIN documents AS document
           ON document.id = instance.document_id
          AND document.tenant_id = instance.tenant_id
         WHERE instance.tenant_id = ? AND instance.id = ?`,
        [request.tenantId, request.workflowInstanceId],
      );
      if (!workflow) {
        throw new AuthorizationDeniedError();
      }
      return workflow.workspaceId;
    }

    return null;
  }
}

function parsePermissionList(serialized: string): readonly string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("Role permissions must be a JSON array of strings.");
  }
  return parsed;
}

function permissionListAllows(
  granted: readonly string[],
  requested: Permission,
): boolean {
  return granted.includes("*") || granted.includes(requested);
}
