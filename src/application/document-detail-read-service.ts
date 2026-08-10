import type { DatabaseProvider } from "./ports";

export class DocumentNotFoundError extends Error {
  public constructor() {
    super("Document was not found in the requested tenant.");
    this.name = "DocumentNotFoundError";
  }
}

export interface DocumentSourceTemplateEvidence {
  id: string;
  name: string;
  versionNumber: number;
  contentHash: string;
  lifecycleState: string;
  provenance: string;
}

export interface DocumentReviewEvidence {
  id: string;
  actorSubjectId: string;
  actorName: string;
  decision: string;
  comment?: string;
  createdAt: string;
}

export interface DocumentWorkflowEvidence {
  id: string;
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  reviews: readonly DocumentReviewEvidence[];
}

export interface DocumentApprovalEvidence {
  id: string;
  actorSubjectId: string;
  actorName: string;
  contentHash: string;
  workflowInstanceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  approvedAt: string;
}

export interface DocumentVersionEvidence {
  id: string;
  versionNumber: number;
  contentHash: string;
  contentProvider: string;
  createdBySubjectId: string;
  createdByName: string;
  createdAt: string;
  isCurrent: boolean;
  exactApprovalApplies: boolean;
  approvals: readonly DocumentApprovalEvidence[];
  workflows: readonly DocumentWorkflowEvidence[];
}

export interface DocumentAuditEvidence {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorSubjectId: string;
  actorName: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface DocumentDetailEvidence {
  id: string;
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  status: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  sourceTemplate?: DocumentSourceTemplateEvidence;
  versions: readonly DocumentVersionEvidence[];
  auditEvents: readonly DocumentAuditEvidence[];
}

interface DocumentRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  status: string;
  currentVersionId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  sourceTemplateHash: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SourceTemplateRow {
  id: string;
  name: string;
  versionNumber: number;
  contentHash: string;
  lifecycleState: string;
  provenance: string;
}

interface VersionRow {
  id: string;
  versionNumber: number;
  contentHash: string;
  contentProvider: string;
  createdBySubjectId: string;
  createdByName: string;
  createdAt: string;
}

interface WorkflowRow {
  id: string;
  documentVersionId: string;
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  state: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewRow {
  id: string;
  workflowInstanceId: string;
  actorSubjectId: string;
  actorName: string;
  decision: string;
  comment: string | null;
  createdAt: string;
}

interface ApprovalRow {
  id: string;
  documentVersionId: string;
  actorSubjectId: string;
  actorName: string;
  contentHash: string;
  workflowInstanceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  approvedAt: string;
}

interface AuditRow {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorSubjectId: string;
  actorName: string;
  occurredAt: string;
  payloadJson: string;
}

export class DocumentDetailReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getDocumentDetail(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentDetailEvidence> {
    const [document] = await this.database.query<DocumentRow>(
      `SELECT
         document.id,
         document.tenant_id AS tenantId,
         document.workspace_id AS workspaceId,
         workspace.name AS workspaceName,
         document.title,
         document.status,
         document.current_version_id AS currentVersionId,
         document.source_template_id AS sourceTemplateId,
         document.source_template_version AS sourceTemplateVersion,
         document.source_template_hash AS sourceTemplateHash,
         document.created_at AS createdAt,
         document.updated_at AS updatedAt
       FROM documents document
       JOIN workspaces workspace
         ON workspace.id = document.workspace_id
        AND workspace.tenant_id = document.tenant_id
       WHERE document.tenant_id = ? AND document.id = ?`,
      [tenantId, documentId],
    );

    if (!document) {
      throw new DocumentNotFoundError();
    }

    const sourceTemplate = await this.loadSourceTemplate(document);
    const versionRows = await this.database.query<VersionRow>(
      `SELECT
         version.id,
         version.version_number AS versionNumber,
         version.content_hash AS contentHash,
         version.content_provider AS contentProvider,
         version.created_by_subject_id AS createdBySubjectId,
         creator.display_name AS createdByName,
         version.created_at AS createdAt
       FROM document_versions version
       JOIN identity_subjects creator ON creator.id = version.created_by_subject_id
       WHERE version.tenant_id = ? AND version.document_id = ?
       ORDER BY version.version_number ASC`,
      [tenantId, documentId],
    );
    const workflowRows = await this.database.query<WorkflowRow>(
      `SELECT
         instance.id,
         instance.document_version_id AS documentVersionId,
         instance.workflow_definition_id AS definitionId,
         definition.name AS definitionName,
         instance.workflow_definition_version AS definitionVersion,
         instance.state,
         instance.created_at AS createdAt,
         instance.updated_at AS updatedAt
       FROM workflow_instances instance
       JOIN workflow_definitions definition
         ON definition.id = instance.workflow_definition_id
        AND definition.version = instance.workflow_definition_version
        AND definition.tenant_id = instance.tenant_id
       WHERE instance.tenant_id = ? AND instance.document_id = ?
       ORDER BY instance.created_at ASC, instance.id ASC`,
      [tenantId, documentId],
    );
    const workflowIds = workflowRows.map((row) => row.id);
    const reviewRows = await this.loadReviews(tenantId, workflowIds);
    const approvalRows = await this.database.query<ApprovalRow>(
      `SELECT
         approval.id,
         approval.document_version_id AS documentVersionId,
         approval.actor_subject_id AS actorSubjectId,
         actor.display_name AS actorName,
         approval.content_hash AS contentHash,
         approval.workflow_instance_id AS workflowInstanceId,
         approval.workflow_definition_id AS workflowDefinitionId,
         approval.workflow_definition_version AS workflowDefinitionVersion,
         approval.approved_at AS approvedAt
       FROM approvals approval
       JOIN identity_subjects actor ON actor.id = approval.actor_subject_id
       WHERE approval.tenant_id = ? AND approval.document_id = ?
       ORDER BY approval.approved_at ASC, approval.id ASC`,
      [tenantId, documentId],
    );

    const workflows = workflowRows.map((workflow) => ({
      id: workflow.id,
      definitionId: workflow.definitionId,
      definitionName: workflow.definitionName,
      definitionVersion: workflow.definitionVersion,
      state: workflow.state,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      reviews: reviewRows
        .filter((review) => review.workflowInstanceId === workflow.id)
        .map(mapReview),
    }));

    const versions = versionRows.map<DocumentVersionEvidence>((version) => {
      const approvals = approvalRows
        .filter((approval) => approval.documentVersionId === version.id)
        .map(mapApproval);
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        contentHash: version.contentHash,
        contentProvider: version.contentProvider,
        createdBySubjectId: version.createdBySubjectId,
        createdByName: version.createdByName,
        createdAt: version.createdAt,
        isCurrent: document.currentVersionId === version.id,
        exactApprovalApplies: approvals.some(
          (approval) => approval.contentHash === version.contentHash,
        ),
        approvals,
        workflows: workflows.filter((workflow) =>
          workflowRows.some(
            (row) =>
              row.id === workflow.id && row.documentVersionId === version.id,
          ),
        ),
      };
    });

    const auditEvents = await this.loadAuditEvents(
      tenantId,
      document,
      versionRows.map((version) => version.id),
      workflowIds,
    );

    return {
      id: document.id,
      tenantId: document.tenantId,
      workspaceId: document.workspaceId,
      workspaceName: document.workspaceName,
      title: document.title,
      status: document.status,
      currentVersionId: document.currentVersionId ?? undefined,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      sourceTemplate,
      versions,
      auditEvents,
    };
  }

  private async loadSourceTemplate(
    document: DocumentRow,
  ): Promise<DocumentSourceTemplateEvidence | undefined> {
    if (
      !document.sourceTemplateId ||
      document.sourceTemplateVersion === null ||
      !document.sourceTemplateHash
    ) {
      return undefined;
    }

    const [source] = await this.database.query<SourceTemplateRow>(
      `SELECT
         template.id,
         template.name,
         version.version_number AS versionNumber,
         version.content_hash AS contentHash,
         version.lifecycle_state AS lifecycleState,
         version.provenance
       FROM templates template
       JOIN template_versions version
         ON version.template_id = template.id
        AND version.tenant_id = template.tenant_id
       WHERE template.tenant_id = ?
         AND template.id = ?
         AND version.version_number = ?
         AND version.content_hash = ?`,
      [
        document.tenantId,
        document.sourceTemplateId,
        document.sourceTemplateVersion,
        document.sourceTemplateHash,
      ],
    );

    return source ? { ...source } : undefined;
  }

  private async loadReviews(
    tenantId: string,
    workflowIds: readonly string[],
  ): Promise<readonly ReviewRow[]> {
    if (workflowIds.length === 0) {
      return [];
    }
    const placeholders = workflowIds.map(() => "?").join(", ");
    return this.database.query<ReviewRow>(
      `SELECT
         review.id,
         review.workflow_instance_id AS workflowInstanceId,
         review.actor_subject_id AS actorSubjectId,
         actor.display_name AS actorName,
         review.decision,
         review.comment,
         review.created_at AS createdAt
       FROM reviews review
       JOIN identity_subjects actor ON actor.id = review.actor_subject_id
       WHERE review.tenant_id = ?
         AND review.workflow_instance_id IN (${placeholders})
       ORDER BY review.created_at ASC, review.id ASC`,
      [tenantId, ...workflowIds],
    );
  }

  private async loadAuditEvents(
    tenantId: string,
    document: DocumentRow,
    versionIds: readonly string[],
    workflowIds: readonly string[],
  ): Promise<readonly DocumentAuditEvidence[]> {
    const entityIds = [document.id, ...versionIds, ...workflowIds];
    const placeholders = entityIds.map(() => "?").join(", ");
    const rows = await this.database.query<AuditRow>(
      `SELECT
         audit.id,
         audit.event_type AS eventType,
         audit.entity_type AS entityType,
         audit.entity_id AS entityId,
         audit.actor_subject_id AS actorSubjectId,
         actor.display_name AS actorName,
         audit.occurred_at AS occurredAt,
         audit.payload_json AS payloadJson
       FROM audit_events audit
       JOIN identity_subjects actor ON actor.id = audit.actor_subject_id
       WHERE audit.tenant_id = ?
         AND audit.workspace_id = ?
         AND audit.entity_id IN (${placeholders})
       ORDER BY audit.occurred_at ASC, audit.id ASC`,
      [tenantId, document.workspaceId, ...entityIds],
    );

    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorSubjectId: row.actorSubjectId,
      actorName: row.actorName,
      occurredAt: row.occurredAt,
      payload: parseAuditPayload(row.payloadJson),
    }));
  }
}

function mapReview(row: ReviewRow): DocumentReviewEvidence {
  return {
    id: row.id,
    actorSubjectId: row.actorSubjectId,
    actorName: row.actorName,
    decision: row.decision,
    comment: row.comment ?? undefined,
    createdAt: row.createdAt,
  };
}

function mapApproval(row: ApprovalRow): DocumentApprovalEvidence {
  return {
    id: row.id,
    actorSubjectId: row.actorSubjectId,
    actorName: row.actorName,
    contentHash: row.contentHash,
    workflowInstanceId: row.workflowInstanceId,
    workflowDefinitionId: row.workflowDefinitionId,
    workflowDefinitionVersion: row.workflowDefinitionVersion,
    approvedAt: row.approvedAt,
  };
}

function parseAuditPayload(
  serialized: string,
): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Audit event payload must be a JSON object.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}
