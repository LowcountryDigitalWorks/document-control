import type { AuthorizationPolicy } from "./authorization";
import type {
  CreateWorkflowDefinitionCommand,
  CreateWorkflowDefinitionVersionCommand,
  WorkflowDefinitionAdminService,
  WorkflowDefinitionCatalog,
  WorkflowDefinitionRecord,
} from "./workflow-definition-admin-service";

export interface WorkflowDefinitionAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedWorkflowDefinitionAdminService {
  public constructor(
    private readonly workflows: WorkflowDefinitionAdminService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getCatalog(
    context: WorkflowDefinitionAuthorizationContext,
  ): Promise<WorkflowDefinitionCatalog> {
    await this.assertDefinitionAdministrationAllowed(context);
    return this.workflows.getCatalog(context.tenantId, context.workspaceId);
  }

  public async createDefinition(
    context: WorkflowDefinitionAuthorizationContext,
    command: Omit<
      CreateWorkflowDefinitionCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<WorkflowDefinitionRecord> {
    await this.assertDefinitionAdministrationAllowed(context);
    return this.workflows.createDefinition({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async createVersion(
    context: WorkflowDefinitionAuthorizationContext,
    command: Omit<
      CreateWorkflowDefinitionVersionCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<WorkflowDefinitionRecord> {
    await this.assertDefinitionAdministrationAllowed(context);
    return this.workflows.createVersion({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertDefinitionAdministrationAllowed(
    context: WorkflowDefinitionAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      permission: "tenant.manage",
    });
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "workflow.manage",
    });
  }
}
