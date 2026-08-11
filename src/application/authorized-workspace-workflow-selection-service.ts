import type { AuthorizationPolicy } from "./authorization";
import type {
  SetDefaultWorkflowCommand,
  SetWorkflowApplicabilityCommand,
  WorkspaceWorkflowSelectionCatalog,
  WorkspaceWorkflowSelectionService,
} from "./workspace-workflow-selection-service";

export interface WorkspaceWorkflowSelectionAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedWorkspaceWorkflowSelectionService {
  public constructor(
    private readonly selections: WorkspaceWorkflowSelectionService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getCatalog(
    context: WorkspaceWorkflowSelectionAuthorizationContext,
  ): Promise<WorkspaceWorkflowSelectionCatalog> {
    await this.assertAllowed(context);
    return this.selections.getCatalog(context.tenantId, context.workspaceId);
  }

  public async setApplicability(
    context: WorkspaceWorkflowSelectionAuthorizationContext,
    command: Omit<
      SetWorkflowApplicabilityCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<{ changed: boolean }> {
    await this.assertAllowed(context);
    return this.selections.setApplicability({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  public async setDefault(
    context: WorkspaceWorkflowSelectionAuthorizationContext,
    command: Omit<
      SetDefaultWorkflowCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<{ changed: boolean }> {
    await this.assertAllowed(context);
    return this.selections.setDefault({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertAllowed(
    context: WorkspaceWorkflowSelectionAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "workflow.manage",
    });
  }
}
