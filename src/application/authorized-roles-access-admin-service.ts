import type { AuthorizationPolicy } from "./authorization";
import type {
  AccessMutationResult,
  AssignWorkspaceRoleCommand,
  CreateCustomWorkspaceRoleCommand,
  RemoveWorkspaceRoleCommand,
  RolesAccessAdminService,
  UpdateCustomWorkspaceRoleCommand,
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
    return this.access.getWorkspaceAccess(
      context.tenantId,
      context.workspaceId,
    );
  }

  public async createCustomWorkspaceRole(
    context: RolesAccessAuthorizationContext,
    command: Omit<
      CreateCustomWorkspaceRoleCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<AccessMutationResult> {
    await this.assertTenantRoleDefinitionManagementAllowed(context);
    return this.access.createCustomWorkspaceRole({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async updateCustomWorkspaceRole(
    context: RolesAccessAuthorizationContext,
    command: Omit<
      UpdateCustomWorkspaceRoleCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<AccessMutationResult> {
    await this.assertTenantRoleDefinitionManagementAllowed(context);
    return this.access.updateCustomWorkspaceRole({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
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

  private async assertTenantRoleDefinitionManagementAllowed(
    context: RolesAccessAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      permission: "tenant.manage",
    });
    await this.assertRoleManagementAllowed(context);
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
