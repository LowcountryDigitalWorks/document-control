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

export type IdentityProvider = "local" | "oidc" | "saml" | "entra" | "external";

export interface IdentitySubject {
  id: Identifier;
  displayName: string;
  email?: string;
  provider: IdentityProvider;
  providerSubject?: string;
  createdAt: IsoTimestamp;
}

export interface TenantMembership {
  id: Identifier;
  tenantId: Identifier;
  subjectId: Identifier;
  status: "active" | "suspended" | "invited";
  createdAt: IsoTimestamp;
}

export type RoleScope = "platform" | "tenant" | "workspace";

export interface RoleDefinition {
  id: Identifier;
  tenantId?: Identifier;
  key: string;
  name: string;
  scope: RoleScope;
  permissions: readonly string[];
  isSystem: boolean;
  createdAt: IsoTimestamp;
  retiredAt?: IsoTimestamp;
}

export interface RoleBinding {
  id: Identifier;
  roleDefinitionId: Identifier;
  subjectId: Identifier;
  tenantId?: Identifier;
  workspaceId?: Identifier;
  createdAt: IsoTimestamp;
}

export type DocumentStatus =
  "draft" | "in_review" | "approved" | "superseded" | "retired";

export type TemplateProvenance =
  "approved_template" | "exception_no_approved_template" | "none";

export interface Document {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  title: string;
  status: DocumentStatus;
  currentVersionId?: Identifier;
  sourceTemplateId?: Identifier;
  sourceTemplateVersion?: number;
  sourceTemplateHash?: string;
  templateProvenance: TemplateProvenance;
}

export interface DocumentVersion {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  versionNumber: number;
  contentHash: string;
  contentProvider: string;
  contentKey: string;
  changeSummary?: string;
  createdBySubjectId: Identifier;
  createdAt: IsoTimestamp;
}

export type TemplateLifecycleState =
  "draft" | "review" | "approved" | "published" | "superseded" | "retired";

export interface Template {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  name: string;
  currentVersion?: number;
}

export interface TemplateVersion {
  id: Identifier;
  tenantId: Identifier;
  templateId: Identifier;
  versionNumber: number;
  lifecycleState: TemplateLifecycleState;
  contentHash: string;
  contentProvider: string;
  contentKey: string;
  createdBySubjectId: Identifier;
  provenance: string;
  createdAt: IsoTimestamp;
  publishedAt?: IsoTimestamp;
  supersededAt?: IsoTimestamp;
}

export interface WorkflowTransition {
  from: string;
  to: string;
}

export interface WorkflowDefinition {
  id: Identifier;
  tenantId: Identifier;
  name: string;
  version: number;
  states: readonly string[];
  transitions: readonly WorkflowTransition[];
}

export interface WorkflowInstance {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  documentVersionId: Identifier;
  workflowDefinitionId: Identifier;
  workflowDefinitionVersion: number;
  state: string;
}

export interface Review {
  id: Identifier;
  tenantId: Identifier;
  workflowInstanceId: Identifier;
  documentVersionId: Identifier;
  actorSubjectId: Identifier;
  decision: "commented" | "accepted" | "changes_requested";
  comment?: string;
  createdAt: IsoTimestamp;
}

export interface Approval {
  id: Identifier;
  tenantId: Identifier;
  documentId: Identifier;
  documentVersionId: Identifier;
  contentHash: string;
  actorSubjectId: Identifier;
  workflowInstanceId: Identifier;
  workflowDefinitionId: Identifier;
  workflowDefinitionVersion: number;
  approvedAt: IsoTimestamp;
}

export interface TenantConfiguration {
  tenantId: Identifier;
  permittedDataProfile:
    "ordinary_business" | "regulated_approved" | "demo_synthetic";
  branding: Readonly<Record<string, string>>;
  terminology: Readonly<Record<string, string>>;
  updatedAt: IsoTimestamp;
}

export interface AuditEvent {
  id: Identifier;
  tenantId: Identifier;
  workspaceId: Identifier;
  actorSubjectId: Identifier;
  eventType: string;
  entityType: string;
  entityId: Identifier;
  occurredAt: IsoTimestamp;
  payload: Readonly<Record<string, unknown>>;
}
