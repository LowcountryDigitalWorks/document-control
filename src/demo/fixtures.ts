import {
  exportFormat,
  exportVersion,
  type PortableExportV1,
} from "../application/export";
import { approveExactVersion } from "../domain/approval";
import type {
  AuditEvent,
  Document,
  DocumentVersion,
  IdentitySubject,
  Review,
  RoleBinding,
  RoleDefinition,
  Tenant,
  TenantConfiguration,
  TenantMembership,
  Template,
  TemplateVersion,
  WorkflowDefinition,
  WorkflowInstance,
  Workspace,
} from "../domain/models";
import {
  buildDocumentVersionContentKey,
  buildTemplateVersionContentKey,
} from "../infrastructure/content-key";

const timestamp = "2026-08-10T12:00:00.000Z";

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

export const syntheticAuthor: IdentitySubject = {
  id: "subject-demo-author",
  displayName: "Avery Author",
  email: "avery.author@example.invalid",
  provider: "external",
  providerSubject: "demo-author",
  createdAt: timestamp,
};

export const syntheticReviewer: IdentitySubject = {
  id: "subject-demo-reviewer",
  displayName: "Riley Reviewer",
  email: "riley.reviewer@example.invalid",
  provider: "external",
  providerSubject: "demo-reviewer",
  createdAt: timestamp,
};

export const syntheticApprover: IdentitySubject = {
  id: "subject-demo-approver",
  displayName: "Alex Approver",
  email: "alex.approver@example.invalid",
  provider: "external",
  providerSubject: "demo-approver",
  createdAt: timestamp,
};

export const syntheticIdentitySubjects: IdentitySubject[] = [
  syntheticAuthor,
  syntheticReviewer,
  syntheticApprover,
];

export const syntheticMemberships: TenantMembership[] = syntheticIdentitySubjects.map(
  (subject, index) => ({
    id: `membership-demo-${index + 1}`,
    tenantId: syntheticTenant.id,
    subjectId: subject.id,
    status: "active",
    createdAt: timestamp,
  }),
);

export const syntheticRoleDefinitions: RoleDefinition[] = [
  {
    id: "role-author",
    key: "author",
    name: "Author",
    scope: "workspace",
    permissions: [],
    isSystem: true,
    createdAt: timestamp,
  },
  {
    id: "role-reviewer",
    key: "reviewer",
    name: "Reviewer",
    scope: "workspace",
    permissions: [],
    isSystem: true,
    createdAt: timestamp,
  },
  {
    id: "role-approver",
    key: "approver",
    name: "Approver",
    scope: "workspace",
    permissions: [],
    isSystem: true,
    createdAt: timestamp,
  },
];

export const syntheticRoleBindings: RoleBinding[] = [
  {
    id: "binding-demo-author",
    roleDefinitionId: "role-author",
    subjectId: syntheticAuthor.id,
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    createdAt: timestamp,
  },
  {
    id: "binding-demo-reviewer",
    roleDefinitionId: "role-reviewer",
    subjectId: syntheticReviewer.id,
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    createdAt: timestamp,
  },
  {
    id: "binding-demo-approver",
    roleDefinitionId: "role-approver",
    subjectId: syntheticApprover.id,
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    createdAt: timestamp,
  },
];

export const syntheticTemplate: Template = {
  id: "template-standard-operating-procedure",
  tenantId: syntheticTenant.id,
  workspaceId: syntheticWorkspace.id,
  name: "Standard Operating Procedure",
  currentVersion: 1,
};

export const syntheticTemplateVersion: TemplateVersion = {
  id: "template-version-standard-operating-procedure-1",
  tenantId: syntheticTenant.id,
  templateId: syntheticTemplate.id,
  versionNumber: 1,
  lifecycleState: "published",
  contentHash: `sha256:${"a".repeat(64)}`,
  contentProvider: "r2",
  contentKey: buildTemplateVersionContentKey({
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    templateId: syntheticTemplate.id,
    versionId: "template-version-standard-operating-procedure-1",
  }),
  createdBySubjectId: syntheticAuthor.id,
  provenance: "LDW synthetic demo fixture",
  createdAt: timestamp,
  publishedAt: "2026-08-10T12:15:00.000Z",
};

export const syntheticVersionOne: DocumentVersion = {
  id: "version-harbor-opening-1",
  tenantId: syntheticTenant.id,
  documentId: "document-harbor-opening",
  versionNumber: 1,
  contentHash: `sha256:${"1".repeat(64)}`,
  contentProvider: "r2",
  contentKey: buildDocumentVersionContentKey({
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    documentId: "document-harbor-opening",
    versionId: "version-harbor-opening-1",
  }),
  createdBySubjectId: syntheticAuthor.id,
  createdAt: "2026-08-10T12:30:00.000Z",
};

export const syntheticVersionTwo: DocumentVersion = {
  id: "version-harbor-opening-2",
  tenantId: syntheticTenant.id,
  documentId: "document-harbor-opening",
  versionNumber: 2,
  contentHash: `sha256:${"2".repeat(64)}`,
  contentProvider: "r2",
  contentKey: buildDocumentVersionContentKey({
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    documentId: "document-harbor-opening",
    versionId: "version-harbor-opening-2",
  }),
  createdBySubjectId: syntheticAuthor.id,
  createdAt: "2026-08-10T13:15:00.000Z",
};

export const syntheticDocument: Document = {
  id: syntheticVersionOne.documentId,
  tenantId: syntheticTenant.id,
  workspaceId: syntheticWorkspace.id,
  title: "Harbor Opening Checklist",
  status: "draft",
  currentVersionId: syntheticVersionTwo.id,
  sourceTemplateId: syntheticTemplate.id,
  sourceTemplateVersion: syntheticTemplateVersion.versionNumber,
  sourceTemplateHash: syntheticTemplateVersion.contentHash,
  templateProvenance: "approved_template",
};

export const syntheticWorkflowDefinition: WorkflowDefinition = {
  id: "workflow-standard-review",
  tenantId: syntheticTenant.id,
  name: "Standard review and approval",
  version: 1,
  states: ["draft", "review", "approval", "approved", "rejected"],
  transitions: [
    { from: "draft", to: "review" },
    { from: "review", to: "draft" },
    { from: "review", to: "approval" },
    { from: "approval", to: "draft" },
    { from: "approval", to: "approved" },
    { from: "approval", to: "rejected" },
    { from: "rejected", to: "draft" },
  ],
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

export const syntheticReview: Review = {
  id: "review-version-1",
  tenantId: syntheticTenant.id,
  workflowInstanceId: syntheticWorkflowInstance.id,
  documentVersionId: syntheticVersionOne.id,
  actorSubjectId: syntheticReviewer.id,
  decision: "accepted",
  comment: "Synthetic review completed.",
  createdAt: "2026-08-10T12:45:00.000Z",
};

export const syntheticApproval = approveExactVersion({
  id: "approval-version-1",
  actorSubjectId: syntheticApprover.id,
  approvedAt: "2026-08-10T13:00:00.000Z",
  documentVersion: syntheticVersionOne,
  workflowDefinition: syntheticWorkflowDefinition,
  workflowInstance: syntheticWorkflowInstance,
});

export const syntheticTenantConfiguration: TenantConfiguration = {
  tenantId: syntheticTenant.id,
  permittedDataProfile: "demo_synthetic",
  branding: {
    companyName: "Lowcountry Digital Works",
    primary: "#163b45",
    secondary: "#247b78",
  },
  terminology: {
    workspace: "Workspace",
    document: "Document",
    approval: "Approval",
  },
  updatedAt: timestamp,
};

export const syntheticAuditEvents: AuditEvent[] = [
  {
    id: "audit-version-1-created",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorSubjectId: syntheticAuthor.id,
    eventType: "document.version.created",
    entityType: "document_version",
    entityId: syntheticVersionOne.id,
    occurredAt: syntheticVersionOne.createdAt,
    payload: { versionNumber: 1, contentHash: syntheticVersionOne.contentHash },
  },
  {
    id: "audit-version-1-reviewed",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorSubjectId: syntheticReviewer.id,
    eventType: "document.version.reviewed",
    entityType: "document_version",
    entityId: syntheticVersionOne.id,
    occurredAt: syntheticReview.createdAt,
    payload: { reviewId: syntheticReview.id, decision: syntheticReview.decision },
  },
  {
    id: "audit-version-1-approved",
    tenantId: syntheticTenant.id,
    workspaceId: syntheticWorkspace.id,
    actorSubjectId: syntheticApproval.actorSubjectId,
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
    actorSubjectId: syntheticAuthor.id,
    eventType: "document.version.created",
    entityType: "document_version",
    entityId: syntheticVersionTwo.id,
    occurredAt: syntheticVersionTwo.createdAt,
    payload: { versionNumber: 2, contentHash: syntheticVersionTwo.contentHash },
  },
];

export function createSyntheticExport(
  exportedAt = "2026-08-10T13:30:00.000Z",
): PortableExportV1 {
  return {
    format: exportFormat,
    version: exportVersion,
    exportedAt,
    tenant: syntheticTenant,
    tenantConfiguration: syntheticTenantConfiguration,
    identitySubjects: syntheticIdentitySubjects,
    tenantMemberships: syntheticMemberships,
    workspaces: [syntheticWorkspace],
    roleDefinitions: syntheticRoleDefinitions,
    roleBindings: syntheticRoleBindings,
    documents: [syntheticDocument],
    documentVersions: [syntheticVersionOne, syntheticVersionTwo],
    templates: [syntheticTemplate],
    templateVersions: [syntheticTemplateVersion],
    workflowDefinitions: [syntheticWorkflowDefinition],
    workflowInstances: [syntheticWorkflowInstance],
    reviews: [syntheticReview],
    approvals: [syntheticApproval],
    auditEvents: syntheticAuditEvents,
  };
}
