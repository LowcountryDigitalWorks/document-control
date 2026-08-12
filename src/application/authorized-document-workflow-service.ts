import type {
  ApproveDocumentVersionCommand,
  CreateChangedVersionCommand,
  CreateDocumentFromTemplateCommand,
  DocumentEvidenceSnapshot,
  DocumentWorkflowService,
  RecordReviewCommand,
  RetireDocumentCommand,
  StartWorkflowCommand,
  TransitionWorkflowCommand,
} from "./document-workflow-service";
import type { AuthorizationPolicy } from "./authorization";
import type {
  Approval,
  Document,
  DocumentVersion,
  Review,
  WorkflowInstance,
} from "../domain/models";

export class AuthorizedDocumentWorkflowService {
  public constructor(
    private readonly workflow: DocumentWorkflowService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async createDocumentFromTemplate(
    command: CreateDocumentFromTemplateCommand,
  ): Promise<DocumentVersion> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      permission: "document.create",
    });
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      permission: "template.use",
    });
    return this.workflow.createDocumentFromTemplate(command);
  }

  public async startWorkflow(
    command: StartWorkflowCommand,
  ): Promise<WorkflowInstance> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      permission: "workflow.execute",
    });
    return this.workflow.startWorkflow(command);
  }

  public async transition(
    command: TransitionWorkflowCommand,
  ): Promise<WorkflowInstance> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      workflowInstanceId: command.workflowInstanceId,
      permission: "workflow.execute",
    });
    return this.workflow.transition(command);
  }

  public async recordReview(command: RecordReviewCommand): Promise<Review> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      workflowInstanceId: command.workflowInstanceId,
      permission: "document.review",
    });
    return this.workflow.recordReview(command);
  }

  public async approveCurrentVersion(
    command: ApproveDocumentVersionCommand,
  ): Promise<Approval> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      workflowInstanceId: command.workflowInstanceId,
      permission: "document.approve",
    });
    return this.workflow.approveCurrentVersion(command);
  }

  public async createChangedVersion(
    command: CreateChangedVersionCommand,
  ): Promise<DocumentVersion> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      permission: "document.version.create",
    });
    return this.workflow.createChangedVersion(command);
  }

  public async retireDocument(
    command: RetireDocumentCommand,
  ): Promise<Document> {
    await this.authorization.assertAllowed({
      subjectId: command.actorSubjectId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      permission: "document.retire",
    });
    return this.workflow.retireDocument(command);
  }

  public async getEvidence(input: {
    tenantId: string;
    documentId: string;
    actorSubjectId: string;
  }): Promise<DocumentEvidenceSnapshot> {
    await this.authorization.assertAllowed({
      subjectId: input.actorSubjectId,
      tenantId: input.tenantId,
      documentId: input.documentId,
      permission: "document.read",
    });
    return this.workflow.getEvidence(input.tenantId, input.documentId);
  }
}
