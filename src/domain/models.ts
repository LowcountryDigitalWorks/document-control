export type Identifier = string;
export type IsoTimestamp = string;

export interface Tenant {
  id: Identifier;
  name: string;
  slug: string;
}

export interface Workspace {
  id: Identifier;
  tenantId: Identifier;
  name: string;
}

export type WorkspaceRole =
  "owner" | "administrator" | "author" | "reviewer" | "approver" | "reader";

export interface RoleAssignment {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  actorId: Identifier;
  role: WorkspaceRole;
}

export interface Document {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  title: string;
  status: "draft" | "in_review" | "approved" | "retired";
  currentVersionId: Identifier;
}

export interface DocumentVersion {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  versionNumber: number;
  contentHash: string;
  contentKey: string;
  createdBy: Identifier;
  createdAt: IsoTimestamp;
}

export interface Template {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  name: string;
  status: "draft" | "approved" | "retired";
  currentVersion: number;
}

export interface WorkflowDefinition {
  id: Identifier;
  tenantId: Identifier;
  name: string;
  version: number;
  states: readonly WorkflowState[];
}

export type WorkflowState =
  "draft" | "review" | "approval" | "approved" | "rejected";

export interface WorkflowInstance {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  documentVersionId: Identifier;
  workflowDefinitionId: Identifier;
  workflowDefinitionVersion: number;
  state: WorkflowState;
}

export interface Review {
  id: Identifier;
  tenantId: Identifier;
  workflowInstanceId: Identifier;
  documentVersionId: Identifier;
  actorId: Identifier;
  decision: "commented" | "accepted" | "changes_requested";
  createdAt: IsoTimestamp;
}

export interface Approval {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  documentVersionId: Identifier;
  contentHash: string;
  actorId: Identifier;
  workflowDefinitionId: Identifier;
  workflowDefinitionVersion: number;
  approvedAt: IsoTimestamp;
}

export interface AuditEvent {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  actorId: Identifier;
  eventType: string;
  entityType: string;
  entityId: Identifier;
  occurredAt: IsoTimestamp;
  payload: Readonly<Record<string, unknown>>;
}
