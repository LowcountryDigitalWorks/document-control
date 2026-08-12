import {
  approveExactVersion,
  approvalAppliesToVersion,
} from "../domain/approval";
import type {
  Approval,
  Document,
  DocumentVersion,
  Review,
  WorkflowDefinition,
  WorkflowInstance,
} from "../domain/models";
import { transitionWorkflow } from "../domain/workflow";
import { buildDocumentVersionContentKey } from "../infrastructure/content-key";
import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface CreateDocumentFromTemplateCommand {
  tenantId: string;
  workspaceId: string;
  documentId: string;
  title: string;
  templateId: string;
  templateVersion: number;
  versionId: string;
  contentHash: string;
  contentKey: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface StartWorkflowCommand {
  tenantId: string;
  documentId: string;
  workflowInstanceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface TransitionWorkflowCommand {
  tenantId: string;
  workflowInstanceId: string;
  targetState: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface RecordReviewCommand {
  tenantId: string;
  workflowInstanceId: string;
  reviewId: string;
  actorSubjectId: string;
  decision: Review["decision"];
  comment?: string;
  occurredAt: string;
  auditEventId: string;
}

export interface ApproveDocumentVersionCommand {
  tenantId: string;
  workflowInstanceId: string;
  approvalId: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface CreateChangedVersionCommand {
  tenantId: string;
  documentId: string;
  versionId: string;
  contentHash: string;
  contentKey: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface RetireDocumentCommand {
  tenantId: string;
  documentId: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
}

export interface VersionApprovalEvidence {
  version: DocumentVersion;
  approvals: readonly Approval[];
  exactApprovalApplies: boolean;
}

export interface DocumentEvidenceSnapshot {
  document: Document;
  currentVersion: DocumentVersion;
  versions: readonly VersionApprovalEvidence[];
}

interface DocumentRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  status: Document["status"];
  currentVersionId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  sourceTemplateHash: string | null;
  templateProvenance: Document["templateProvenance"];
}

interface DocumentVersionRow {
  id: string;
  tenantId: string;
  documentId: string;
  versionNumber: number;
  contentHash: string;
  contentProvider: string;
  contentKey: string;
  createdBySubjectId: string;
  createdAt: string;
}

interface TemplateSourceRow {
  workspaceId: string;
  lifecycleState: string;
  contentHash: string;
}

interface WorkflowRow {
  instanceId: string;
  tenantId: string;
  documentId: string;
  documentVersionId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  state: string;
  definitionName: string;
  definitionJson: string;
}

interface ApprovalRow {
  id: string;
  tenantId: string;
  documentId: string;
  documentVersionId: string;
  contentHash: string;
  actorSubjectId: string;
  workflowInstanceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  approvedAt: string;
}

export class DocumentWorkflowService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async createDocumentFromTemplate(
    command: CreateDocumentFromTemplateCommand,
  ): Promise<DocumentVersion> {
    assertCanonicalHash(command.contentHash);
    assertExpectedContentKey(command);

    const [template] = await this.database.query<TemplateSourceRow>(
      `SELECT
         templates.workspace_id AS workspaceId,
         template_versions.lifecycle_state AS lifecycleState,
         template_versions.content_hash AS contentHash
       FROM templates
       JOIN template_versions
         ON template_versions.template_id = templates.id
        AND template_versions.tenant_id = templates.tenant_id
       WHERE templates.id = ?
         AND templates.tenant_id = ?
         AND template_versions.version_number = ?`,
      [command.templateId, command.tenantId, command.templateVersion],
    );

    if (!template) {
      throw new Error(
        "The requested template version does not exist in this tenant.",
      );
    }
    if (template.workspaceId !== command.workspaceId) {
      throw new Error(
        "The requested template belongs to a different workspace.",
      );
    }
    if (!["approved", "published"].includes(template.lifecycleState)) {
      throw new Error(
        "Documents can only be created from an approved template version.",
      );
    }

    const version: DocumentVersion = {
      id: command.versionId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      versionNumber: 1,
      contentHash: command.contentHash,
      contentProvider: "r2",
      contentKey: command.contentKey,
      createdBySubjectId: command.actorSubjectId,
      createdAt: command.occurredAt,
    };

    await this.database.executeBatch([
      statement(
        `INSERT INTO documents
           (id, tenant_id, workspace_id, title, status, current_version_id,
            source_template_id, source_template_version, source_template_hash,
            template_provenance, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?, ?, 'approved_template', ?, ?)`,
        [
          command.documentId,
          command.tenantId,
          command.workspaceId,
          command.title,
          command.templateId,
          command.templateVersion,
          template.contentHash,
          command.occurredAt,
          command.occurredAt,
        ],
      ),
      insertVersionStatement(version),
      statement(
        "UPDATE documents SET current_version_id = ? WHERE id = ? AND tenant_id = ?",
        [command.versionId, command.documentId, command.tenantId],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "document.created_from_template",
        entityType: "document",
        entityId: command.documentId,
        occurredAt: command.occurredAt,
        payload: {
          versionId: command.versionId,
          versionNumber: 1,
          contentHash: command.contentHash,
          templateId: command.templateId,
          templateVersion: command.templateVersion,
          templateHash: template.contentHash,
        },
      }),
    ]);

    return version;
  }

  public async startWorkflow(
    command: StartWorkflowCommand,
  ): Promise<WorkflowInstance> {
    const document = await this.loadDocument(
      command.tenantId,
      command.documentId,
    );
    assertDocumentOpenForWork(document);
    if (!document.currentVersionId) {
      throw new Error(
        "A document must have a current version before a workflow can start.",
      );
    }
    const definition = await this.loadWorkflowDefinition(
      command.tenantId,
      command.workflowDefinitionId,
      command.workflowDefinitionVersion,
    );
    const initialState = definition.states[0];
    if (!initialState) {
      throw new Error("The selected workflow definition has no initial state.");
    }

    const instance: WorkflowInstance = {
      id: command.workflowInstanceId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      documentVersionId: document.currentVersionId,
      workflowDefinitionId: definition.id,
      workflowDefinitionVersion: definition.version,
      state: initialState,
    };

    await this.database.executeBatch([
      statement(
        `INSERT INTO workflow_instances
           (id, tenant_id, document_id, document_version_id, workflow_definition_id,
            workflow_definition_version, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          instance.id,
          instance.tenantId,
          instance.documentId,
          instance.documentVersionId,
          instance.workflowDefinitionId,
          instance.workflowDefinitionVersion,
          instance.state,
          command.occurredAt,
          command.occurredAt,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.started",
        entityType: "workflow_instance",
        entityId: instance.id,
        occurredAt: command.occurredAt,
        payload: {
          documentId: command.documentId,
          documentVersionId: document.currentVersionId,
          workflowDefinitionId: definition.id,
          workflowDefinitionVersion: definition.version,
          initialState,
        },
      }),
    ]);

    return instance;
  }

  public async transition(
    command: TransitionWorkflowCommand,
  ): Promise<WorkflowInstance> {
    const { instance, definition } = await this.loadWorkflowBundle(
      command.tenantId,
      command.workflowInstanceId,
    );
    if (command.targetState === "approved") {
      throw new Error(
        "Use approveCurrentVersion so approval evidence is recorded atomically.",
      );
    }

    const next = transitionWorkflow(instance, command.targetState, definition);
    const document = await this.loadDocument(
      command.tenantId,
      instance.documentId,
    );
    assertDocumentOpenForWork(document);
    const documentStatus = statusForWorkflowState(next.state);
    const statements: DatabaseStatement[] = [
      statement(
        "UPDATE workflow_instances SET state = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
        [next.state, command.occurredAt, next.id, command.tenantId],
      ),
    ];

    if (documentStatus) {
      statements.push(
        statement(
          "UPDATE documents SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND current_version_id = ?",
          [
            documentStatus,
            command.occurredAt,
            document.id,
            command.tenantId,
            instance.documentVersionId,
          ],
        ),
      );
    }

    statements.push(
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.transitioned",
        entityType: "workflow_instance",
        entityId: instance.id,
        occurredAt: command.occurredAt,
        payload: { from: instance.state, to: next.state },
      }),
    );

    await this.database.executeBatch(statements);
    return next;
  }

  public async recordReview(command: RecordReviewCommand): Promise<Review> {
    const { instance, definition } = await this.loadWorkflowBundle(
      command.tenantId,
      command.workflowInstanceId,
    );
    if (instance.state !== "review") {
      throw new Error(
        "A review decision can only be recorded while the workflow is in review.",
      );
    }
    const document = await this.loadDocument(
      command.tenantId,
      instance.documentId,
    );
    assertDocumentOpenForWork(document);
    if (document.currentVersionId !== instance.documentVersionId) {
      throw new Error(
        "A superseded workflow version cannot receive review evidence for the current document.",
      );
    }

    const review: Review = {
      id: command.reviewId,
      tenantId: command.tenantId,
      workflowInstanceId: instance.id,
      documentVersionId: instance.documentVersionId,
      actorSubjectId: command.actorSubjectId,
      decision: command.decision,
      comment: command.comment,
      createdAt: command.occurredAt,
    };

    const statements: DatabaseStatement[] = [
      statement(
        `INSERT INTO reviews
           (id, tenant_id, workflow_instance_id, document_version_id, actor_subject_id,
            decision, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.id,
          review.tenantId,
          review.workflowInstanceId,
          review.documentVersionId,
          review.actorSubjectId,
          review.decision,
          review.comment ?? null,
          review.createdAt,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "document.version.reviewed",
        entityType: "document_version",
        entityId: instance.documentVersionId,
        occurredAt: command.occurredAt,
        payload: { reviewId: review.id, decision: review.decision },
      }),
    ];

    const target =
      review.decision === "accepted"
        ? "approval"
        : review.decision === "changes_requested"
          ? "draft"
          : null;
    if (target) {
      const next = transitionWorkflow(instance, target, definition);
      statements.push(
        statement(
          "UPDATE workflow_instances SET state = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
          [next.state, command.occurredAt, instance.id, command.tenantId],
        ),
      );
      const documentStatus = statusForWorkflowState(next.state);
      if (documentStatus) {
        statements.push(
          statement(
            "UPDATE documents SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND current_version_id = ?",
            [
              documentStatus,
              command.occurredAt,
              document.id,
              command.tenantId,
              instance.documentVersionId,
            ],
          ),
        );
      }
    }

    await this.database.executeBatch(statements);
    return review;
  }

  public async approveCurrentVersion(
    command: ApproveDocumentVersionCommand,
  ): Promise<Approval> {
    const { instance, definition } = await this.loadWorkflowBundle(
      command.tenantId,
      command.workflowInstanceId,
    );
    if (instance.state !== "approval") {
      throw new Error(
        "The workflow must be in approval before approval evidence is recorded.",
      );
    }
    const document = await this.loadDocument(
      command.tenantId,
      instance.documentId,
    );
    assertDocumentOpenForWork(document);
    if (document.currentVersionId !== instance.documentVersionId) {
      throw new Error(
        "A superseded workflow version cannot be approved as the current document.",
      );
    }
    const version = await this.loadDocumentVersion(
      command.tenantId,
      instance.documentVersionId,
    );
    const approvedInstance = transitionWorkflow(
      instance,
      "approved",
      definition,
    );
    const approval = approveExactVersion({
      id: command.approvalId,
      actorSubjectId: command.actorSubjectId,
      approvedAt: command.occurredAt,
      documentVersion: version,
      workflowDefinition: definition,
      workflowInstance: instance,
    });

    await this.database.executeBatch([
      statement(
        `INSERT INTO approvals
           (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id,
            workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.id,
          approval.tenantId,
          approval.documentId,
          approval.documentVersionId,
          approval.contentHash,
          approval.actorSubjectId,
          approval.workflowInstanceId,
          approval.workflowDefinitionId,
          approval.workflowDefinitionVersion,
          approval.approvedAt,
        ],
      ),
      statement(
        "UPDATE workflow_instances SET state = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
        [
          approvedInstance.state,
          command.occurredAt,
          instance.id,
          command.tenantId,
        ],
      ),
      statement(
        "UPDATE documents SET status = 'approved', updated_at = ? WHERE id = ? AND tenant_id = ? AND current_version_id = ?",
        [command.occurredAt, document.id, command.tenantId, version.id],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "document.version.approved",
        entityType: "document_version",
        entityId: version.id,
        occurredAt: command.occurredAt,
        payload: {
          approvalId: approval.id,
          contentHash: approval.contentHash,
          workflowInstanceId: approval.workflowInstanceId,
        },
      }),
    ]);

    return approval;
  }

  public async createChangedVersion(
    command: CreateChangedVersionCommand,
  ): Promise<DocumentVersion> {
    assertCanonicalHash(command.contentHash);
    const document = await this.loadDocument(
      command.tenantId,
      command.documentId,
    );
    assertDocumentOpenForWork(document);
    assertExpectedContentKey({
      ...command,
      workspaceId: document.workspaceId,
    });
    const rows = await this.database.query<{ nextVersionNumber: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS nextVersionNumber
       FROM document_versions
       WHERE tenant_id = ? AND document_id = ?`,
      [command.tenantId, command.documentId],
    );
    const nextVersionNumber = rows[0]?.nextVersionNumber ?? 1;
    const version: DocumentVersion = {
      id: command.versionId,
      tenantId: command.tenantId,
      documentId: command.documentId,
      versionNumber: nextVersionNumber,
      contentHash: command.contentHash,
      contentProvider: "r2",
      contentKey: command.contentKey,
      createdBySubjectId: command.actorSubjectId,
      createdAt: command.occurredAt,
    };

    await this.database.executeBatch([
      insertVersionStatement(version),
      statement(
        "UPDATE documents SET current_version_id = ?, status = 'draft', updated_at = ? WHERE id = ? AND tenant_id = ?",
        [
          command.versionId,
          command.occurredAt,
          command.documentId,
          command.tenantId,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "document.version.created",
        entityType: "document_version",
        entityId: command.versionId,
        occurredAt: command.occurredAt,
        payload: {
          versionNumber: nextVersionNumber,
          contentHash: command.contentHash,
          previousVersionId: document.currentVersionId,
        },
      }),
    ]);

    return version;
  }

  public async retireDocument(
    command: RetireDocumentCommand,
  ): Promise<Document> {
    const document = await this.loadDocument(
      command.tenantId,
      command.documentId,
    );
    if (document.status === "retired") {
      return document;
    }
    if (document.status !== "approved") {
      throw new Error("Only approved documents can be retired.");
    }
    if (!document.currentVersionId) {
      throw new Error(
        "An approved document must have a current version before retirement.",
      );
    }

    const version = await this.loadDocumentVersion(
      command.tenantId,
      document.currentVersionId,
    );
    const [approval] = await this.database.query<{ id: string }>(
      `SELECT id
       FROM approvals
       WHERE tenant_id = ?
         AND document_id = ?
         AND document_version_id = ?
         AND content_hash = ?
       LIMIT 1`,
      [command.tenantId, document.id, version.id, version.contentHash],
    );
    if (!approval) {
      throw new Error(
        "Document retirement requires exact approval evidence for the current version.",
      );
    }

    await this.database.executeBatch([
      statement(
        "UPDATE documents SET status = 'retired', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'approved' AND current_version_id = ?",
        [command.occurredAt, document.id, command.tenantId, version.id],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: document.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "document.retired",
        entityType: "document",
        entityId: document.id,
        occurredAt: command.occurredAt,
        payload: {
          previousStatus: document.status,
          currentVersionId: version.id,
          currentVersionNumber: version.versionNumber,
          contentHash: version.contentHash,
          approvalId: approval.id,
        },
      }),
    ]);

    return { ...document, status: "retired" };
  }

  public async getEvidence(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentEvidenceSnapshot> {
    const document = await this.loadDocument(tenantId, documentId);
    if (!document.currentVersionId) {
      throw new Error("Document has no current version.");
    }
    const versionRows = await this.database.query<DocumentVersionRow>(
      `${documentVersionSelect}
       WHERE tenant_id = ? AND document_id = ?
       ORDER BY version_number ASC`,
      [tenantId, documentId],
    );
    const approvalRows = await this.database.query<ApprovalRow>(
      `SELECT
         id,
         tenant_id AS tenantId,
         document_id AS documentId,
         document_version_id AS documentVersionId,
         content_hash AS contentHash,
         actor_subject_id AS actorSubjectId,
         workflow_instance_id AS workflowInstanceId,
         workflow_definition_id AS workflowDefinitionId,
         workflow_definition_version AS workflowDefinitionVersion,
         approved_at AS approvedAt
       FROM approvals
       WHERE tenant_id = ? AND document_id = ?
       ORDER BY approved_at ASC, id ASC`,
      [tenantId, documentId],
    );
    const approvals = approvalRows.map(mapApproval);
    const versions = versionRows.map(mapDocumentVersion).map((version) => {
      const versionApprovals = approvals.filter(
        (approval) => approval.documentVersionId === version.id,
      );
      return {
        version,
        approvals: versionApprovals,
        exactApprovalApplies: versionApprovals.some((approval) =>
          approvalAppliesToVersion(approval, version),
        ),
      };
    });
    const currentVersion = versions.find(
      (evidence) => evidence.version.id === document.currentVersionId,
    )?.version;
    if (!currentVersion) {
      throw new Error("Document current-version reference is inconsistent.");
    }

    return { document, currentVersion, versions };
  }

  private async loadDocument(
    tenantId: string,
    documentId: string,
  ): Promise<Document> {
    const [row] = await this.database.query<DocumentRow>(
      `SELECT
         id,
         tenant_id AS tenantId,
         workspace_id AS workspaceId,
         title,
         status,
         current_version_id AS currentVersionId,
         source_template_id AS sourceTemplateId,
         source_template_version AS sourceTemplateVersion,
         source_template_hash AS sourceTemplateHash,
         template_provenance AS templateProvenance
       FROM documents
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, documentId],
    );
    if (!row) {
      throw new Error("Document was not found in the requested tenant.");
    }
    return mapDocument(row);
  }

  private async loadDocumentVersion(
    tenantId: string,
    versionId: string,
  ): Promise<DocumentVersion> {
    const [row] = await this.database.query<DocumentVersionRow>(
      `${documentVersionSelect} WHERE tenant_id = ? AND id = ?`,
      [tenantId, versionId],
    );
    if (!row) {
      throw new Error(
        "Document version was not found in the requested tenant.",
      );
    }
    return mapDocumentVersion(row);
  }

  private async loadWorkflowDefinition(
    tenantId: string,
    definitionId: string,
    definitionVersion: number,
  ): Promise<WorkflowDefinition> {
    const [row] = await this.database.query<{
      id: string;
      tenantId: string;
      name: string;
      version: number;
      definitionJson: string;
    }>(
      `SELECT
         id,
         tenant_id AS tenantId,
         name,
         version,
         definition_json AS definitionJson
       FROM workflow_definitions
       WHERE tenant_id = ? AND id = ? AND version = ?`,
      [tenantId, definitionId, definitionVersion],
    );
    if (!row) {
      throw new Error(
        "Workflow definition was not found in the requested tenant.",
      );
    }
    return mapWorkflowDefinition(row);
  }

  private async loadWorkflowBundle(
    tenantId: string,
    instanceId: string,
  ): Promise<{ instance: WorkflowInstance; definition: WorkflowDefinition }> {
    const [row] = await this.database.query<WorkflowRow>(
      `SELECT
         instance.id AS instanceId,
         instance.tenant_id AS tenantId,
         instance.document_id AS documentId,
         instance.document_version_id AS documentVersionId,
         instance.workflow_definition_id AS workflowDefinitionId,
         instance.workflow_definition_version AS workflowDefinitionVersion,
         instance.state,
         definition.name AS definitionName,
         definition.definition_json AS definitionJson
       FROM workflow_instances AS instance
       JOIN workflow_definitions AS definition
         ON definition.id = instance.workflow_definition_id
        AND definition.version = instance.workflow_definition_version
        AND definition.tenant_id = instance.tenant_id
       WHERE instance.tenant_id = ? AND instance.id = ?`,
      [tenantId, instanceId],
    );
    if (!row) {
      throw new Error(
        "Workflow instance was not found in the requested tenant.",
      );
    }
    return {
      instance: {
        id: row.instanceId,
        tenantId: row.tenantId,
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        workflowDefinitionId: row.workflowDefinitionId,
        workflowDefinitionVersion: row.workflowDefinitionVersion,
        state: row.state,
      },
      definition: mapWorkflowDefinition({
        id: row.workflowDefinitionId,
        tenantId: row.tenantId,
        name: row.definitionName,
        version: row.workflowDefinitionVersion,
        definitionJson: row.definitionJson,
      }),
    };
  }
}

const documentVersionSelect = `SELECT
  id,
  tenant_id AS tenantId,
  document_id AS documentId,
  version_number AS versionNumber,
  content_hash AS contentHash,
  content_provider AS contentProvider,
  content_key AS contentKey,
  created_by_subject_id AS createdBySubjectId,
  created_at AS createdAt
FROM document_versions`;

function insertVersionStatement(version: DocumentVersion): DatabaseStatement {
  return statement(
    `INSERT INTO document_versions
       (id, tenant_id, document_id, version_number, content_hash, content_provider,
        content_key, created_by_subject_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      version.id,
      version.tenantId,
      version.documentId,
      version.versionNumber,
      version.contentHash,
      version.contentProvider,
      version.contentKey,
      version.createdBySubjectId,
      version.createdAt,
    ],
  );
}

function auditStatement(input: {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}): DatabaseStatement {
  return statement(
    `INSERT INTO audit_events
       (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type,
        entity_id, occurred_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.eventType,
      input.entityType,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  );
}

function statement(
  sql: string,
  parameters: readonly unknown[] = [],
): DatabaseStatement {
  return { sql, parameters };
}

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status,
    currentVersionId: row.currentVersionId ?? undefined,
    sourceTemplateId: row.sourceTemplateId ?? undefined,
    sourceTemplateVersion: row.sourceTemplateVersion ?? undefined,
    sourceTemplateHash: row.sourceTemplateHash ?? undefined,
    templateProvenance: row.templateProvenance,
  };
}

function mapDocumentVersion(row: DocumentVersionRow): DocumentVersion {
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    contentHash: row.contentHash,
    contentProvider: row.contentProvider,
    contentKey: row.contentKey,
    createdBySubjectId: row.createdBySubjectId,
    createdAt: row.createdAt,
  };
}

function mapApproval(row: ApprovalRow): Approval {
  return { ...row };
}

function mapWorkflowDefinition(row: {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  definitionJson: string;
}): WorkflowDefinition {
  const parsed: unknown = JSON.parse(row.definitionJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow definition JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.states) || !Array.isArray(record.transitions)) {
    throw new Error(
      "Workflow definition JSON is missing states or transitions.",
    );
  }
  const states = record.states.map((state) => {
    if (typeof state !== "string") {
      throw new Error("Workflow states must be strings.");
    }
    return state;
  });
  const transitions = record.transitions.map((transition) => {
    if (
      typeof transition !== "object" ||
      transition === null ||
      Array.isArray(transition)
    ) {
      throw new Error("Workflow transitions must be objects.");
    }
    const candidate = transition as Record<string, unknown>;
    if (
      typeof candidate.from !== "string" ||
      typeof candidate.to !== "string"
    ) {
      throw new Error("Workflow transitions require string from/to states.");
    }
    return { from: candidate.from, to: candidate.to };
  });
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    version: row.version,
    states,
    transitions,
  };
}

function assertExpectedContentKey(input: {
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  contentKey: string;
}): void {
  const expected = buildDocumentVersionContentKey({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    versionId: input.versionId,
  });
  if (input.contentKey !== expected) {
    throw new Error(
      "Document content key must be generated by the application-owned key builder.",
    );
  }
}

function assertDocumentOpenForWork(document: Document): void {
  if (document.status === "retired") {
    throw new Error(
      "Retired documents are historical and cannot be changed or receive new workflow activity.",
    );
  }
}

function assertCanonicalHash(hash: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new Error(
      "Document versions require a canonical SHA-256 content hash.",
    );
  }
}

function statusForWorkflowState(state: string): Document["status"] | null {
  if (state === "draft") {
    return "draft";
  }
  if (state === "review" || state === "approval") {
    return "in_review";
  }
  return null;
}
