import type { AuthorizationPolicy } from "./authorization";
import type {
  AccessMutationResult,
  AssignWorkspaceRoleCommand,
  RemoveWorkspaceRoleCommand,
  RolesAccessAdminService,
  WorkspaceAccessSnapshot,
} from "./roles-access-admin-service";

export interface RolesAccessAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedRolesAccessAdminService {
  public constructor(
    private readonly access: RolesAccessAdminService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getWorkspaceAccess(
    context: RolesAccessAuthorizationContext,
  ): Promise<WorkspaceAccessSnapshot> {
    await this.assertRoleManagementAllowed(context);
    return this.access.getWorkspaceAccess(context.tenantId, context.workspaceId);
  }

  public async assignWorkspaceRole(
    context: RolesAccessAuthorizationContext,
    command: Omit<
      AssignWorkspaceRoleCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<AccessMutationResult> {
    await this.assertRoleManagementAllowed(context);
    return this.access.assignWorkspaceRole({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async removeWorkspaceRole(
    context: RolesAccessAuthorizationContext,
    command: Omit<
      RemoveWorkspaceRoleCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<AccessMutationResult> {
    await this.assertRoleManagementAllowed(context);
    return this.access.removeWorkspaceRole({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertRoleManagementAllowed(
    context: RolesAccessAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "role.manage",
    });
  }
}
