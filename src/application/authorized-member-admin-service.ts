import type { AuthorizationPolicy } from "./authorization";
import type {
  CreateDirectMemberCommand,
  MemberAdminService,
  TenantMemberDirectory,
  TransitionMembershipCommand,
} from "./member-admin-service";

export interface MemberAdminAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedMemberAdminService {
  public constructor(
    private readonly members: MemberAdminService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getDirectory(
    context: MemberAdminAuthorizationContext,
  ): Promise<TenantMemberDirectory> {
    await this.assertTenantMemberAdministrationAllowed(context);
    return this.members.getDirectory(context.tenantId, context.workspaceId);
  }

  public async createDirectMember(
    context: MemberAdminAuthorizationContext,
    command: Omit<
      CreateDirectMemberCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<TenantMemberDirectory> {
    await this.assertTenantMemberAdministrationAllowed(context);
    return this.members.createDirectMember({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async transitionMembership(
    context: MemberAdminAuthorizationContext,
    command: Omit<
      TransitionMembershipCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<TenantMemberDirectory> {
    await this.assertTenantMemberAdministrationAllowed(context);
    return this.members.transitionMembership({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertTenantMemberAdministrationAllowed(
    context: MemberAdminAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      permission: "tenant.manage",
    });
  }
}
