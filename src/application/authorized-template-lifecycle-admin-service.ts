import type { AuthorizationPolicy } from "./authorization";
import type {
  CreateTemplateRevisionCommand,
  TemplateLifecycleAdminService,
  TemplateLifecycleCatalog,
  TemplateLifecycleVersionRecord,
  TransitionTemplateVersionCommand,
} from "./template-lifecycle-admin-service";

export interface TemplateLifecycleAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedTemplateLifecycleAdminService {
  public constructor(
    private readonly templates: TemplateLifecycleAdminService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getCatalog(
    context: TemplateLifecycleAuthorizationContext,
  ): Promise<TemplateLifecycleCatalog> {
    await this.assertTemplateManagementAllowed(context);
    return this.templates.getCatalog(context.tenantId, context.workspaceId);
  }

  public async createRevision(
    context: TemplateLifecycleAuthorizationContext,
    command: Omit<
      CreateTemplateRevisionCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.assertTemplateManagementAllowed(context);
    return this.templates.createRevision({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async transitionVersion(
    context: TemplateLifecycleAuthorizationContext,
    command: Omit<
      TransitionTemplateVersionCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.assertTemplateManagementAllowed(context);
    return this.templates.transitionVersion({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertTemplateManagementAllowed(
    context: TemplateLifecycleAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "template.manage",
    });
  }
}
