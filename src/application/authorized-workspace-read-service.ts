import type { AuthorizationPolicy } from "./authorization";
import type {
  WorkspaceDocumentFilters,
  WorkspaceDocumentListItem,
  WorkspaceOverview,
  WorkspaceReadService,
  WorkspaceTemplateFilters,
  WorkspaceTemplateListItem,
} from "./workspace-read-service";

export interface WorkspaceReadContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedWorkspaceReadService {
  public constructor(
    private readonly read: WorkspaceReadService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getOverview(
    context: WorkspaceReadContext,
  ): Promise<WorkspaceOverview> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "document.read",
    });
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "template.read",
    });
    return this.read.getOverview(context.tenantId, context.workspaceId);
  }

  public async listDocuments(
    context: WorkspaceReadContext,
    filters: WorkspaceDocumentFilters = {},
  ): Promise<readonly WorkspaceDocumentListItem[]> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "document.read",
    });
    return this.read.listDocuments(
      context.tenantId,
      context.workspaceId,
      filters,
    );
  }

  public async listTemplates(
    context: WorkspaceReadContext,
    filters: WorkspaceTemplateFilters = {},
  ): Promise<readonly WorkspaceTemplateListItem[]> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "template.read",
    });
    return this.read.listTemplates(
      context.tenantId,
      context.workspaceId,
      filters,
    );
  }
}
