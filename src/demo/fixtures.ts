import { approveExactVersion } from "../domain/approval";
import type {
  AuditEvent,
  Document,
  DocumentVersion,
  RoleAssignment,
  Tenant,
  Template,
  WorkflowDefinition,
  WorkflowInstance,
  Workspace,
} from "../domain/models";
import {
  exportFormat,
  exportVersion,
  type PortableExportV1,
} from "../application/export";

const timestamp = "2025-08-23T14:30:00.000Z";

export const syntheticTenant: Tenant = {
  id: "tenant-harbor-demo",
  name: "Harbor Works Demo",
  slug: "harbor-works-demo",
};

export const syntheticWorkspace: Workspace = {
  id: "workspace-operations",
  tenantId: syntheticTenant.id,
  name: "Operations",
};

export const syntheticRoleAssignment: RoleAssignment = {
  id: "role-demo-approver",
  tenantId: syntheticTenant.id,
  workspaceId: syntheticWorkspace.id,
  actorId: "actor-demo-approver",
  role: "approver",
};

export const syntheticTemplate: Template = {
  id: "template-standard-operating-procedure",
  tenantId: syntheticTenant.id,
  workspaceId: syntheticWorkspace.id,
  name: "Standard Operating Procedure",
  status: "approved",
  currentVersion: 1,
};

export const syntheticVersionOne: DocumentVersion = {
  id: "version-harbor-opening-1",
  tenantId: syntheticTenant.id,
  documentId: "document-harbor-opening",
  versionNumber: 1,
  contentHash: `sha256:${"1".repeat(64)}`,
  contentKey: "tenant-harbor-demo/document-harbor-opening/version-1.html",
  createdBy: "actor-demo-author",
  createdAt: timestamp,
};

export const syntheticVersionTwo: DocumentVersion = {
  id: "version-harbor-opening-2",
  tenantId: syntheticTenant.id,
  documentId: "document-harbor-opening",
  versionNumber: 2,
  contentHash: `sha256:${"2".repeat(64)}`,
  contentKey: "tenant-harbor-demo/document-harbor-opening/version-2.html",
  createdBy: "actor-demo-author",
  createdAt: "2025-08-24T09:15:00.000Z",
};

export const syntheticDocument: Document = {
  id: syntheticVersionOne.documentId,
  tenantId: syntheticTenant.id,
  workspaceId: syntheticWorkspace.id,
  title: "Harbor Opening Checklist",
  status: "draft",
  currentVersionId: syntheticVersionTwo.id,
};

export const syntheticWorkflowDefinition: WorkflowDefinition = {
  id: "workflow-standard-review",
  tenantId: syntheticTenant.id,
  name: "Standard review and approval",
  version: 1,
  states: ["draft", "review", "approval", "approved", "rejected"],
};

export const syntheticWorkflowInstance: WorkflowInstance = {
  id: "workflow-instance-version-1",
  tenantId: syntheticTenant.id,
  documentId: syntheticDocument.id,
  documentVersionId: syntheticVersionOne.id,
  workflowDefinitionId: syntheticWorkflowDefinition.id,
  workflowDefinitionVersion: syntheticWorkflowDefinition.version,
  state: "approved",
};

export const syntheticApproval = approveExactVersion({
  id: "approval-version-1",
  actorId: syntheticRoleAssignment.actorId,
  approvedAt: timestamp,
  documentVersion: syntheticVersionOne,
  workflowDefinition: syntheticWorkflowDefinition,
});

export const syntheticAuditEvents: AuditEvent[] = [
  {
    id: "audit-version-1-created",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorId: "actor-demo-author",
    eventType: "document.version.created",
    entityType: "document_version",
    entityId: syntheticVersionOne.id,
    occurredAt: timestamp,
    payload: { versionNumber: 1, contentHash: syntheticVersionOne.contentHash },
  },
  {
    id: "audit-version-1-approved",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorId: syntheticApproval.actorId,
    eventType: "document.version.approved",
    entityType: "document_version",
    entityId: syntheticVersionOne.id,
    occurredAt: syntheticApproval.approvedAt,
    payload: {
      approvalId: syntheticApproval.id,
      contentHash: syntheticApproval.contentHash,
    },
  },
  {
    id: "audit-version-2-created",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorId: "actor-demo-author",
    eventType: "document.version.created",
    entityType: "document_version",
    entityId: syntheticVersionTwo.id,
    occurredAt: syntheticVersionTwo.createdAt,
    payload: { versionNumber: 2, contentHash: syntheticVersionTwo.contentHash },
  },
];

export function createSyntheticExport(
  exportedAt = "2025-08-24T10:00:00.000Z",
): PortableExportV1 {
  return {
    format: exportFormat,
    version: exportVersion,
    exportedAt,
    tenant: syntheticTenant,
    workspaces: [syntheticWorkspace],
    roleAssignments: [syntheticRoleAssignment],
    documents: [syntheticDocument],
    documentVersions: [syntheticVersionOne, syntheticVersionTwo],
    templates: [syntheticTemplate],
    workflowDefinitions: [syntheticWorkflowDefinition],
    workflowInstances: [syntheticWorkflowInstance],
    approvals: [syntheticApproval],
    auditEvents: syntheticAuditEvents,
  };
}
