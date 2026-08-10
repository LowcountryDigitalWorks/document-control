import type { DatabaseProvider } from "./ports";

export type WorkQueueKind = "review" | "approval";

export interface WorkQueueItem {
  workflowInstanceId: string;
  workflowState: WorkQueueKind;
  workflowUpdatedAt: string;
  workflowDefinitionName: string;
  workflowDefinitionVersion: number;
  documentId: string;
  documentTitle: string;
  documentStatus: string;
  documentUpdatedAt: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
}

interface WorkQueueRow {
  workflowInstanceId: string;
  workflowState: WorkQueueKind;
  workflowUpdatedAt: string;
  workflowDefinitionName: string;
  workflowDefinitionVersion: number;
  documentId: string;
  documentTitle: string;
  documentStatus: string;
  documentUpdatedAt: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
}

export class ReviewApprovalQueueReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async listQueue(
    tenantId: string,
    workspaceId: string,
    kind: WorkQueueKind,
  ): Promise<readonly WorkQueueItem[]> {
    const approvalGuard =
      kind === "approval"
        ? `AND NOT EXISTS (
             SELECT 1
             FROM approvals AS approval
             WHERE approval.tenant_id = workflow.tenant_id
               AND approval.document_id = document.id
               AND approval.document_version_id = version.id
               AND approval.content_hash = version.content_hash
           )`
        : "";

    return this.database.query<WorkQueueRow>(
      `SELECT
         workflow.id AS workflowInstanceId,
         workflow.state AS workflowState,
         workflow.updated_at AS workflowUpdatedAt,
         definition.name AS workflowDefinitionName,
         definition.version AS workflowDefinitionVersion,
         document.id AS documentId,
         document.title AS documentTitle,
         document.status AS documentStatus,
         document.updated_at AS documentUpdatedAt,
         version.id AS versionId,
         version.version_number AS versionNumber,
         version.content_hash AS contentHash
       FROM workflow_instances AS workflow
       JOIN documents AS document
         ON document.id = workflow.document_id
        AND document.tenant_id = workflow.tenant_id
       JOIN document_versions AS version
         ON version.id = workflow.document_version_id
        AND version.document_id = document.id
        AND version.tenant_id = document.tenant_id
       JOIN workflow_definitions AS definition
         ON definition.id = workflow.workflow_definition_id
        AND definition.version = workflow.workflow_definition_version
        AND definition.tenant_id = workflow.tenant_id
       WHERE workflow.tenant_id = ?
         AND document.workspace_id = ?
         AND workflow.state = ?
         AND document.current_version_id = workflow.document_version_id
         ${approvalGuard}
       ORDER BY workflow.updated_at ASC, document.title COLLATE NOCASE ASC, document.id ASC`,
      [tenantId, workspaceId, kind],
    );
  }
}
