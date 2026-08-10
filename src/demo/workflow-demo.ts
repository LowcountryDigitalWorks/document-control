import { AuthorizedDocumentWorkflowService } from "../application/authorized-document-workflow-service";
import { DocumentWorkflowService } from "../application/document-workflow-service";
import type { DatabaseProvider } from "../application/ports";
import { buildDocumentVersionContentKey } from "../infrastructure/content-key";
import { DatabaseAuthorizationPolicy } from "../infrastructure/database-authorization-policy";

export const guidedDemo = {
  tenantId: "demo-tenant-guided",
  tenantName: "Harbor Works Demo",
  workspaceId: "demo-workspace-operations",
  workspaceName: "Operations",
  templateId: "demo-template-sop",
  templateName: "Standard Operating Procedure",
  workflowDefinitionId: "demo-workflow-standard",
  documentId: "demo-document-opening-checklist",
  documentTitle: "Harbor Opening Checklist",
  versionOneId: "demo-document-version-1",
  versionTwoId: "demo-document-version-2",
  workflowInstanceId: "demo-workflow-instance-1",
  authorSubjectId: "demo-subject-author",
  reviewerSubjectId: "demo-subject-reviewer",
  approverSubjectId: "demo-subject-approver",
} as const;

export type GuidedDemoAction =
  "create" | "submit" | "review" | "approve" | "change";

export type GuidedDemoPhase =
  "ready" | "created" | "review" | "approval" | "approved" | "changed";

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

export async function ensureGuidedDemoSeed(
  database: DatabaseProvider,
): Promise<void> {
  await assertAuthorizationMigration(database);

  await database.executeBatch([
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [
        guidedDemo.authorSubjectId,
        "Avery Author",
        guidedDemo.authorSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [
        guidedDemo.reviewerSubjectId,
        "Riley Reviewer",
        guidedDemo.reviewerSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      [
        guidedDemo.approverSubjectId,
        "Alex Approver",
        guidedDemo.approverSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      [
        guidedDemo.tenantId,
        guidedDemo.tenantName,
        "guided-demo",
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      [
        guidedDemo.workspaceId,
        guidedDemo.tenantId,
        guidedDemo.workspaceName,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        "demo-membership-author",
        guidedDemo.tenantId,
        guidedDemo.authorSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        "demo-membership-reviewer",
        guidedDemo.tenantId,
        guidedDemo.reviewerSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [
        "demo-membership-approver",
        guidedDemo.tenantId,
        guidedDemo.approverSubjectId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-author', ?, ?, ?, ?)",
      [
        "demo-binding-author",
        guidedDemo.authorSubjectId,
        guidedDemo.tenantId,
        guidedDemo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-reviewer', ?, ?, ?, ?)",
      [
        "demo-binding-reviewer",
        guidedDemo.reviewerSubjectId,
        guidedDemo.tenantId,
        guidedDemo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-approver', ?, ?, ?, ?)",
      [
        "demo-binding-approver",
        guidedDemo.approverSubjectId,
        guidedDemo.tenantId,
        guidedDemo.workspaceId,
        seedTimestamp,
      ],
    ),
    statement(
      "INSERT OR IGNORE INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
      [
        guidedDemo.templateId,
        guidedDemo.tenantId,
        guidedDemo.workspaceId,
        guidedDemo.templateName,
        seedTimestamp,
      ],
    ),
    statement(
      `INSERT OR IGNORE INTO template_versions
         (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
          content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
       VALUES (?, ?, ?, 1, 'published', ?, 'r2', ?, ?, ?, ?, ?)`,
      [
        "demo-template-version-1",
        guidedDemo.tenantId,
        guidedDemo.templateId,
        templateHash,
        `tenants/${guidedDemo.tenantId}/workspaces/${guidedDemo.workspaceId}/templates/${guidedDemo.templateId}/versions/demo-template-version-1/content`,
        guidedDemo.authorSubjectId,
        "Synthetic LDW guided document-control demonstration",
        seedTimestamp,
        seedTimestamp,
      ],
    ),
    statement(
      "UPDATE templates SET current_version = 1 WHERE id = ? AND tenant_id = ? AND current_version IS NULL",
      [guidedDemo.templateId, guidedDemo.tenantId],
    ),
    statement(
      `INSERT OR IGNORE INTO workflow_definitions
         (id, tenant_id, name, version, definition_json, created_at)
       VALUES (?, ?, 'Standard review and approval', 1, ?, ?)`,
      [
        guidedDemo.workflowDefinitionId,
        guidedDemo.tenantId,
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
): Promise<GuidedDemoState> {
  await ensureGuidedDemoSeed(database);
  const service = createAuthorizedService(database);

  const documentRows = await database.query<{ id: string }>(
    "SELECT id FROM documents WHERE tenant_id = ? AND id = ?",
    [guidedDemo.tenantId, guidedDemo.documentId],
  );

  if (documentRows.length === 0) {
    return stateForPhase("ready", []);
  }

  const evidence = await service.getEvidence({
    tenantId: guidedDemo.tenantId,
    documentId: guidedDemo.documentId,
    actorSubjectId: guidedDemo.authorSubjectId,
  });
  const workflowRows = await database.query<WorkflowStateRow>(
    "SELECT state FROM workflow_instances WHERE tenant_id = ? AND id = ?",
    [guidedDemo.tenantId, guidedDemo.workflowInstanceId],
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
    ...stateForPhase(phase, versions),
    documentStatus: evidence.document.status,
    currentVersionNumber: evidence.currentVersion.versionNumber,
    workflowState,
  };
}

export async function runGuidedDemoAction(
  database: DatabaseProvider,
  action: GuidedDemoAction,
  occurredAt: string,
): Promise<GuidedDemoState> {
  const current = await loadGuidedDemoState(database);
  if (current.nextAction !== action) {
    throw new Error(
      "That demo action is not valid for the current document state.",
    );
  }

  const service = createAuthorizedService(database);

  if (action === "create") {
    await service.createDocumentFromTemplate({
      tenantId: guidedDemo.tenantId,
      workspaceId: guidedDemo.workspaceId,
      documentId: guidedDemo.documentId,
      title: guidedDemo.documentTitle,
      templateId: guidedDemo.templateId,
      templateVersion: 1,
      versionId: guidedDemo.versionOneId,
      contentHash: versionOneHash,
      contentKey: buildDocumentVersionContentKey({
        tenantId: guidedDemo.tenantId,
        workspaceId: guidedDemo.workspaceId,
        documentId: guidedDemo.documentId,
        versionId: guidedDemo.versionOneId,
      }),
      actorSubjectId: guidedDemo.authorSubjectId,
      occurredAt,
      auditEventId: "demo-audit-document-created",
    });
  } else if (action === "submit") {
    await service.startWorkflow({
      tenantId: guidedDemo.tenantId,
      documentId: guidedDemo.documentId,
      workflowInstanceId: guidedDemo.workflowInstanceId,
      workflowDefinitionId: guidedDemo.workflowDefinitionId,
      workflowDefinitionVersion: 1,
      actorSubjectId: guidedDemo.authorSubjectId,
      occurredAt,
      auditEventId: "demo-audit-workflow-started",
    });
    await service.transition({
      tenantId: guidedDemo.tenantId,
      workflowInstanceId: guidedDemo.workflowInstanceId,
      targetState: "review",
      actorSubjectId: guidedDemo.authorSubjectId,
      occurredAt,
      auditEventId: "demo-audit-submitted-review",
    });
  } else if (action === "review") {
    await service.recordReview({
      tenantId: guidedDemo.tenantId,
      workflowInstanceId: guidedDemo.workflowInstanceId,
      reviewId: "demo-review-version-1",
      actorSubjectId: guidedDemo.reviewerSubjectId,
      decision: "accepted",
      comment: "Synthetic reviewer accepted version 1.",
      occurredAt,
      auditEventId: "demo-audit-review-accepted",
    });
  } else if (action === "approve") {
    await service.approveCurrentVersion({
      tenantId: guidedDemo.tenantId,
      workflowInstanceId: guidedDemo.workflowInstanceId,
      approvalId: "demo-approval-version-1",
      actorSubjectId: guidedDemo.approverSubjectId,
      occurredAt,
      auditEventId: "demo-audit-version-approved",
    });
  } else {
    await service.createChangedVersion({
      tenantId: guidedDemo.tenantId,
      documentId: guidedDemo.documentId,
      versionId: guidedDemo.versionTwoId,
      contentHash: versionTwoHash,
      contentKey: buildDocumentVersionContentKey({
        tenantId: guidedDemo.tenantId,
        workspaceId: guidedDemo.workspaceId,
        documentId: guidedDemo.documentId,
        versionId: guidedDemo.versionTwoId,
      }),
      actorSubjectId: guidedDemo.authorSubjectId,
      occurredAt,
      auditEventId: "demo-audit-version-two-created",
    });
  }

  return loadGuidedDemoState(database);
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
  phase: GuidedDemoPhase,
  versions: readonly GuidedDemoVersion[],
): GuidedDemoState {
  const next = nextActionForPhase(phase);
  return {
    phase,
    tenantName: guidedDemo.tenantName,
    workspaceName: guidedDemo.workspaceName,
    templateName: guidedDemo.templateName,
    documentTitle: guidedDemo.documentTitle,
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
