import { AuthorizedDocumentWorkflowService } from "../application/authorized-document-workflow-service";
import { DocumentWorkflowService } from "../application/document-workflow-service";
import type { DatabaseProvider } from "../application/ports";
import { buildDocumentVersionContentKey } from "../infrastructure/content-key";
import { DatabaseAuthorizationPolicy } from "../infrastructure/database-authorization-policy";

export type GuidedDemoAction =
  | "create"
  | "submit"
  | "review"
  | "approve"
  | "change";

export type GuidedDemoPhase =
  | "ready"
  | "created"
  | "review"
  | "approval"
  | "approved"
  | "changed";

export interface GuidedDemoContext {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  templateId: string;
  templateVersionId: string;
  templateName: string;
  workflowDefinitionId: string;
  documentId: string;
  documentTitle: string;
  versionOneId: string;
  versionTwoId: string;
  workflowInstanceId: string;
  authorSubjectId: string;
  reviewerSubjectId: string;
  approverSubjectId: string;
  authorMembershipId: string;
  reviewerMembershipId: string;
  approverMembershipId: string;
  authorBindingId: string;
  reviewerBindingId: string;
  approverBindingId: string;
}

export interface GuidedDemoVersion {
  id: string;
  versionNumber: number;
  contentHash: string;
  exactApprovalApplies: boolean;
}

export interface GuidedDemoState {
  phase: GuidedDemoPhase;
  tenantName: string;
  workspaceName: string;
  templateName: string;
  documentTitle: string;
  documentStatus?: string;
  currentVersionNumber?: number;
  workflowState?: string;
  versions: readonly GuidedDemoVersion[];
  nextAction?: GuidedDemoAction;
  nextActionLabel?: string;
}

interface WorkflowStateRow {
  state: string;
}

interface RolePermissionRow {
  permissionsJson: string;
}

const versionOneHash = `sha256:${"1".repeat(64)}`;
const versionTwoHash = `sha256:${"2".repeat(64)}`;
const templateHash = `sha256:${"a".repeat(64)}`;
const seedTimestamp = "2026-08-10T20:30:00.000Z";

export function createGuidedDemoContext(sessionId: string): GuidedDemoContext {
  if (!isValidGuidedDemoSessionId(sessionId)) {
    throw new Error("Guided demo session identifiers must be canonical UUIDs.");
  }

  const namespace = sessionId.toLowerCase().replaceAll("-", "");
  const prefix = `demo-${namespace}`;
  return {
    sessionId: sessionId.toLowerCase(),
    tenantId: `${prefix}-tenant`,
    tenantName: "Harbor Works Demo",
    tenantSlug: `guided-demo-${namespace}`,
    workspaceId: `${prefix}-workspace-operations`,
    workspaceName: "Operations",
    templateId: `${prefix}-template-sop`,
    templateVersionId: `${prefix}-template-version-1`,
    templateName: "Standard Operating Procedure",
    workflowDefinitionId: `${prefix}-workflow-standard`,
    documentId: `${prefix}-document-opening-checklist`,
    documentTitle: "Harbor Opening Checklist",
    versionOneId: `${prefix}-document-version-1`,
    versionTwoId: `${prefix}-document-version-2`,
    workflowInstanceId: `${prefix}-workflow-instance-1`,
    authorSubjectId: `${prefix}-subject-author`,
    reviewerSubjectId: `${prefix}-subject-reviewer`,
    approverSubjectId: `${prefix}-subject-approver`,
    authorMembershipId: `${prefix}-membership-author`,
    reviewerMembershipId: `${prefix}-membership-reviewer`,
    approverMembershipId: `${prefix}-membership-approver`,
    authorBindingId: `${prefix}-binding-author`,
    reviewerBindingId: `${prefix}-binding-reviewer`,
    approverBindingId: `${prefix}-binding-approver`,
  };
}

export function isValidGuidedDemoSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function ensureGuidedDemoSeed(
  database: DatabaseProvider,
  sessionId: string,
): Promise<void> {
  await assertAuthorizationMigration(database);
  const demo = createGuidedDemoContext(sessionId);

  await database.executeBatch([
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [demo.authorSubjectId, "Avery Author", demo.authorSubjectId, seedTimestamp],
    ),
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [
        demo.reviewerSubjectId,
        "Riley Reviewer",
        demo.reviewerSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [
        demo.approverSubjectId,
        "Alex Approver",
        demo.approverSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      [demo.tenantId, demo.tenantName, demo.tenantSlug, seedTimestamp],
    ),
    statement(
      "INSERT OR IGNORE INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      [demo.workspaceId, demo.tenantId, demo.workspaceName, seedTimestamp],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        demo.authorMembershipId,
        demo.tenantId,
        demo.authorSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        demo.reviewerMembershipId,
        demo.tenantId,
        demo.reviewerSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        demo.approverMembershipId,
        demo.tenantId,
        demo.approverSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-author', ?, ?, ?, ?)",
      [
        demo.authorBindingId,
        demo.authorSubjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-reviewer', ?, ?, ?, ?)",
      [
        demo.reviewerBindingId,
        demo.reviewerSubjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-approver', ?, ?, ?, ?)",
      [
        demo.approverBindingId,
        demo.approverSubjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
      [
        demo.templateId,
        demo.tenantId,
        demo.workspaceId,
        demo.templateName,
        seedTimestamp,
      ],
    ),
    statement(
      `INSERT OR IGNORE INTO template_versions
         (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
          content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
       VALUES (?, ?, ?, 1, 'published', ?, 'r2', ?, ?, ?, ?, ?)`,
      [
        demo.templateVersionId,
        demo.tenantId,
        demo.templateId,
        templateHash,
        `tenants/${demo.tenantId}/workspaces/${demo.workspaceId}/templates/${demo.templateId}/versions/${demo.templateVersionId}/content`,
        demo.authorSubjectId,
        "Synthetic LDW guided document-control demonstration",
        seedTimestamp,
        seedTimestamp,
      ],
    ),
    statement(
      "UPDATE templates SET current_version = 1 WHERE id = ? AND tenant_id = ? AND current_version IS NULL",
      [demo.templateId, demo.tenantId],
    ),
    statement(
      `INSERT OR IGNORE INTO workflow_definitions
         (id, tenant_id, name, version, definition_json, created_at)
       VALUES (?, ?, 'Standard review and approval', 1, ?, ?)`,
      [
        demo.workflowDefinitionId,
        demo.tenantId,
        JSON.stringify({
          states: ["draft", "review", "approval", "approved"],
          transitions: [
            { from: "draft", to: "review" },
            { from: "review", to: "draft" },
            { from: "review", to: "approval" },
            { from: "approval", to: "draft" },
            { from: "approval", to: "approved" },
          ],
        }),
        seedTimestamp,
      ],
    ),
  ]);
}

export async function loadGuidedDemoState(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedDemoState> {
  const demo = createGuidedDemoContext(sessionId);
  await ensureGuidedDemoSeed(database, sessionId);
  const service = createAuthorizedService(database);

  const documentRows = await database.query<{ id: string }>(
    "SELECT id FROM documents WHERE tenant_id = ? AND id = ?",
    [demo.tenantId, demo.documentId],
  );

  if (documentRows.length === 0) {
    return stateForPhase(demo, "ready", []);
  }

  const evidence = await service.getEvidence({
    tenantId: demo.tenantId,
    documentId: demo.documentId,
    actorSubjectId: demo.authorSubjectId,
  });
  const workflowRows = await database.query<WorkflowStateRow>(
    "SELECT state FROM workflow_instances WHERE tenant_id = ? AND id = ?",
    [demo.tenantId, demo.workflowInstanceId],
  );
  const workflowState = workflowRows[0]?.state;
  const versions = evidence.versions.map((item) => ({
    id: item.version.id,
    versionNumber: item.version.versionNumber,
    contentHash: item.version.contentHash,
    exactApprovalApplies: item.exactApprovalApplies,
  }));

  let phase: GuidedDemoPhase;
  if (evidence.currentVersion.versionNumber >= 2) {
    phase = "changed";
  } else if (evidence.document.status === "approved") {
    phase = "approved";
  } else if (workflowState === "approval") {
    phase = "approval";
  } else if (workflowState === "review") {
    phase = "review";
  } else {
    phase = "created";
  }

  return {
    ...stateForPhase(demo, phase, versions),
    documentStatus: evidence.document.status,
    currentVersionNumber: evidence.currentVersion.versionNumber,
    workflowState,
  };
}

export async function runGuidedDemoAction(
  database: DatabaseProvider,
  sessionId: string,
  action: GuidedDemoAction,
  occurredAt: string,
): Promise<GuidedDemoState> {
  const demo = createGuidedDemoContext(sessionId);
  const current = await loadGuidedDemoState(database, sessionId);
  if (current.nextAction !== action) {
    throw new Error(
      "That demo action is not valid for the current document state.",
    );
  }

  const service = createAuthorizedService(database);
  const id = (suffix: string) => `demo-${sessionId.replaceAll("-", "")}-${suffix}`;

  if (action === "create") {
    await service.createDocumentFromTemplate({
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
      documentId: demo.documentId,
      title: demo.documentTitle,
      templateId: demo.templateId,
      templateVersion: 1,
      versionId: demo.versionOneId,
      contentHash: versionOneHash,
      contentKey: buildDocumentVersionContentKey({
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
        documentId: demo.documentId,
        versionId: demo.versionOneId,
      }),
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-document-created"),
    });
  } else if (action === "submit") {
    await service.startWorkflow({
      tenantId: demo.tenantId,
      documentId: demo.documentId,
      workflowInstanceId: demo.workflowInstanceId,
      workflowDefinitionId: demo.workflowDefinitionId,
      workflowDefinitionVersion: 1,
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-workflow-started"),
    });
    await service.transition({
      tenantId: demo.tenantId,
      workflowInstanceId: demo.workflowInstanceId,
      targetState: "review",
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-submitted-review"),
    });
  } else if (action === "review") {
    await service.recordReview({
      tenantId: demo.tenantId,
      workflowInstanceId: demo.workflowInstanceId,
      reviewId: id("review-version-1"),
      actorSubjectId: demo.reviewerSubjectId,
      decision: "accepted",
      comment: "Synthetic reviewer accepted version 1.",
      occurredAt,
      auditEventId: id("audit-review-accepted"),
    });
  } else if (action === "approve") {
    await service.approveCurrentVersion({
      tenantId: demo.tenantId,
      workflowInstanceId: demo.workflowInstanceId,
      approvalId: id("approval-version-1"),
      actorSubjectId: demo.approverSubjectId,
      occurredAt,
      auditEventId: id("audit-version-approved"),
    });
  } else {
    await service.createChangedVersion({
      tenantId: demo.tenantId,
      documentId: demo.documentId,
      versionId: demo.versionTwoId,
      contentHash: versionTwoHash,
      contentKey: buildDocumentVersionContentKey({
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
        documentId: demo.documentId,
        versionId: demo.versionTwoId,
      }),
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-version-two-created"),
    });
  }

  return loadGuidedDemoState(database, sessionId);
}

function createAuthorizedService(
  database: DatabaseProvider,
): AuthorizedDocumentWorkflowService {
  return new AuthorizedDocumentWorkflowService(
    new DocumentWorkflowService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function stateForPhase(
  demo: GuidedDemoContext,
  phase: GuidedDemoPhase,
  versions: readonly GuidedDemoVersion[],
): GuidedDemoState {
  const next = nextActionForPhase(phase);
  return {
    phase,
    tenantName: demo.tenantName,
    workspaceName: demo.workspaceName,
    templateName: demo.templateName,
    documentTitle: demo.documentTitle,
    versions,
    nextAction: next?.action,
    nextActionLabel: next?.label,
  };
}

function nextActionForPhase(
  phase: GuidedDemoPhase,
): { action: GuidedDemoAction; label: string } | undefined {
  if (phase === "ready") {
    return { action: "create", label: "Create from approved template" };
  }
  if (phase === "created") {
    return { action: "submit", label: "Submit version 1 for review" };
  }
  if (phase === "review") {
    return { action: "review", label: "Record reviewer acceptance" };
  }
  if (phase === "approval") {
    return { action: "approve", label: "Approve exact version 1" };
  }
  if (phase === "approved") {
    return { action: "change", label: "Create changed version 2" };
  }
  return undefined;
}

async function assertAuthorizationMigration(
  database: DatabaseProvider,
): Promise<void> {
  const rows = await database.query<RolePermissionRow>(
    "SELECT permissions_json AS permissionsJson FROM role_definitions WHERE id = 'role-author'",
  );
  const permissionsJson = rows[0]?.permissionsJson;
  if (!permissionsJson || permissionsJson === "[]") {
    throw new Error(
      "The authorization permission migration must be applied before the guided demo can run.",
    );
  }
}

function statement(
  sql: string,
  parameters: readonly unknown[] = [],
): { sql: string; parameters: readonly unknown[] } {
  return { sql, parameters };
}
