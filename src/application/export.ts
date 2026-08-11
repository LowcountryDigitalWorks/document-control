import type {
  Approval,
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

export const exportFormat = "ldw.document-control.export" as const;
export const exportVersion = 1 as const;

export interface WorkflowDefinitionLifecycleExport {
  tenantId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  lifecycleState: "active" | "deprecated" | "retired";
  changedBySubjectId?: string;
  changedAt: string;
}

export interface WorkspaceWorkflowAssignmentExport {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  isDefault: boolean;
  createdBySubjectId: string;
  createdAt: string;
  updatedBySubjectId: string;
  updatedAt: string;
}

export interface PortableExportV1 {
  format: typeof exportFormat;
  version: typeof exportVersion;
  exportedAt: string;
  tenant: Tenant;
  tenantConfiguration: TenantConfiguration;
  identitySubjects: IdentitySubject[];
  tenantMemberships: TenantMembership[];
  workspaces: Workspace[];
  roleDefinitions: RoleDefinition[];
  roleBindings: RoleBinding[];
  documents: Document[];
  documentVersions: DocumentVersion[];
  templates: Template[];
  templateVersions: TemplateVersion[];
  workflowDefinitions: WorkflowDefinition[];
  workflowDefinitionLifecycles?: WorkflowDefinitionLifecycleExport[];
  workspaceWorkflowAssignments?: WorkspaceWorkflowAssignmentExport[];
  workflowInstances: WorkflowInstance[];
  reviews: Review[];
  approvals: Approval[];
  auditEvents: AuditEvent[];
}

export function serializeExport(data: PortableExportV1): string {
  validatePortableExport(data);
  return JSON.stringify(data, null, 2);
}

export function parseExport(serialized: string): PortableExportV1 {
  const candidate: unknown = JSON.parse(serialized);
  const root = requireRecord(candidate, "export");

  if (root.format !== exportFormat || root.version !== exportVersion) {
    throw new Error("Unsupported document-control export format or version.");
  }

  requireString(root.exportedAt, "exportedAt");
  requireRecord(root.tenant, "tenant");
  requireRecord(root.tenantConfiguration, "tenantConfiguration");

  for (const field of arrayFields) {
    requireArray(root[field], field);
  }
  if (root.workflowDefinitionLifecycles !== undefined) {
    requireArray(
      root.workflowDefinitionLifecycles,
      "workflowDefinitionLifecycles",
    );
  }
  if (root.workspaceWorkflowAssignments !== undefined) {
    requireArray(
      root.workspaceWorkflowAssignments,
      "workspaceWorkflowAssignments",
    );
  }

  const data = candidate as unknown as PortableExportV1;
  validatePortableExport(data);
  return data;
}

export function validatePortableExport(data: PortableExportV1): void {
  const tenantId = requireString(data.tenant.id, "tenant.id");
  requireString(data.tenant.name, "tenant.name");
  requireString(data.tenant.slug, "tenant.slug");

  if (data.tenantConfiguration.tenantId !== tenantId) {
    throw new Error(
      "Tenant configuration crosses the exported tenant boundary.",
    );
  }

  const subjects = indexById(data.identitySubjects, "identitySubjects");
  const workspaces = indexById(data.workspaces, "workspaces");
  const documents = indexById(data.documents, "documents");
  const documentVersions = indexById(data.documentVersions, "documentVersions");
  const templates = indexById(data.templates, "templates");
  const workflowInstances = indexById(
    data.workflowInstances,
    "workflowInstances",
  );

  for (const workspace of data.workspaces) {
    assertTenant(workspace.tenantId, tenantId, `workspace ${workspace.id}`);
  }

  const activeMembershipKeys = new Set<string>();
  for (const membership of data.tenantMemberships) {
    assertTenant(membership.tenantId, tenantId, `membership ${membership.id}`);
    assertReferenced(subjects, membership.subjectId, "membership subject");
    activeMembershipKeys.add(`${membership.tenantId}:${membership.subjectId}`);
  }

  const roleDefinitions = indexById(data.roleDefinitions, "roleDefinitions");
  for (const role of data.roleDefinitions) {
    if (role.tenantId !== undefined) {
      assertTenant(role.tenantId, tenantId, `role definition ${role.id}`);
    }
    if (!["platform", "tenant", "workspace"].includes(role.scope)) {
      throw new Error(`Role definition ${role.id} has an invalid scope.`);
    }
    if (role.retiredAt !== undefined) {
      requireString(role.retiredAt, `role definition ${role.id} retiredAt`);
      if (role.isSystem || role.scope !== "workspace" || !role.tenantId) {
        throw new Error(
          `Only tenant-owned custom workspace roles may be retired (${role.id}).`,
        );
      }
    }
  }

  for (const binding of data.roleBindings) {
    const role = assertReferenced(
      roleDefinitions,
      binding.roleDefinitionId,
      "role definition",
    ) as RoleDefinition;
    assertReferenced(subjects, binding.subjectId, "role-binding subject");

    if (role.scope === "platform") {
      if (binding.tenantId !== undefined || binding.workspaceId !== undefined) {
        throw new Error(
          `Platform role binding ${binding.id} must be unscoped.`,
        );
      }
      continue;
    }

    if (!binding.tenantId) {
      throw new Error(`Role binding ${binding.id} is missing a tenant scope.`);
    }
    assertTenant(binding.tenantId, tenantId, `role binding ${binding.id}`);
    if (!activeMembershipKeys.has(`${tenantId}:${binding.subjectId}`)) {
      throw new Error(
        `Role binding ${binding.id} targets a non-member subject.`,
      );
    }

    if (role.scope === "workspace") {
      if (!binding.workspaceId) {
        throw new Error(
          `Workspace role binding ${binding.id} lacks a workspace.`,
        );
      }
      const workspace = assertReferenced(
        workspaces,
        binding.workspaceId,
        "role-binding workspace",
      ) as Workspace;
      assertTenant(workspace.tenantId, tenantId, `workspace ${workspace.id}`);
    } else if (binding.workspaceId !== undefined) {
      throw new Error(
        `Tenant role binding ${binding.id} must not name a workspace.`,
      );
    }
  }

  const templateVersionByKey = new Map<string, TemplateVersion>();
  for (const template of data.templates) {
    assertTenant(template.tenantId, tenantId, `template ${template.id}`);
    assertReferenced(workspaces, template.workspaceId, "template workspace");
  }

  for (const version of data.templateVersions) {
    assertTenant(version.tenantId, tenantId, `template version ${version.id}`);
    assertCanonicalHash(version.contentHash, `template version ${version.id}`);
    assertReferenced(
      templates,
      version.templateId,
      "template version template",
    );
    assertReferenced(subjects, version.createdBySubjectId, "template creator");
    templateVersionByKey.set(
      `${version.templateId}:${version.versionNumber}`,
      version,
    );
  }

  for (const document of data.documents) {
    assertTenant(document.tenantId, tenantId, `document ${document.id}`);
    assertReferenced(workspaces, document.workspaceId, "document workspace");

    if (document.templateProvenance === "approved_template") {
      if (
        !document.sourceTemplateId ||
        document.sourceTemplateVersion === undefined ||
        !document.sourceTemplateHash
      ) {
        throw new Error(
          `Document ${document.id} has incomplete template provenance.`,
        );
      }
      const source = templateVersionByKey.get(
        `${document.sourceTemplateId}:${document.sourceTemplateVersion}`,
      );
      if (!source || source.contentHash !== document.sourceTemplateHash) {
        throw new Error(
          `Document ${document.id} template provenance does not match.`,
        );
      }
    } else if (
      document.sourceTemplateId !== undefined ||
      document.sourceTemplateVersion !== undefined ||
      document.sourceTemplateHash !== undefined
    ) {
      throw new Error(
        `Document ${document.id} carries unexpected template references.`,
      );
    }
  }

  for (const version of data.documentVersions) {
    assertTenant(version.tenantId, tenantId, `document version ${version.id}`);
    assertCanonicalHash(version.contentHash, `document version ${version.id}`);
    assertReferenced(
      documents,
      version.documentId,
      "document version document",
    );
    assertReferenced(subjects, version.createdBySubjectId, "document creator");
  }

  for (const document of data.documents) {
    if (document.currentVersionId) {
      const version = assertReferenced(
        documentVersions,
        document.currentVersionId,
        "current document version",
      ) as DocumentVersion;
      if (version.documentId !== document.id || version.tenantId !== tenantId) {
        throw new Error(
          `Document ${document.id} current version crosses a boundary.`,
        );
      }
    }
  }

  const workflowDefinitions = new Map<string, WorkflowDefinition>();
  for (const definition of data.workflowDefinitions) {
    assertTenant(
      definition.tenantId,
      tenantId,
      `workflow definition ${definition.id}`,
    );
    if (definition.version < 1 || definition.states.length === 0) {
      throw new Error(
        `Workflow definition ${definition.id} is structurally invalid.`,
      );
    }
    const states = new Set(definition.states);
    if (states.size !== definition.states.length) {
      throw new Error(
        `Workflow definition ${definition.id} has duplicate states.`,
      );
    }
    for (const transition of definition.transitions) {
      if (!states.has(transition.from) || !states.has(transition.to)) {
        throw new Error(
          `Workflow definition ${definition.id} has a transition to an undefined state.`,
        );
      }
    }
    workflowDefinitions.set(
      `${definition.id}:${definition.version}`,
      definition,
    );
  }

  const workflowLifecycleByKey = new Map<
    string,
    WorkflowDefinitionLifecycleExport
  >();
  if (data.workflowDefinitionLifecycles !== undefined) {
    for (const lifecycle of data.workflowDefinitionLifecycles) {
      assertTenant(
        lifecycle.tenantId,
        tenantId,
        `workflow lifecycle ${lifecycle.workflowDefinitionId}`,
      );
      const key = `${lifecycle.workflowDefinitionId}:${lifecycle.workflowDefinitionVersion}`;
      if (!workflowDefinitions.has(key)) {
        throw new Error(
          `Workflow lifecycle ${key} references a missing workflow definition version.`,
        );
      }
      if (workflowLifecycleByKey.has(key)) {
        throw new Error(
          `Workflow lifecycle contains duplicate version ${key}.`,
        );
      }
      if (
        !["active", "deprecated", "retired"].includes(lifecycle.lifecycleState)
      ) {
        throw new Error(`Workflow lifecycle ${key} has an invalid state.`);
      }
      requireString(lifecycle.changedAt, `workflow lifecycle ${key} changedAt`);
      if (lifecycle.changedBySubjectId !== undefined) {
        assertReferenced(
          subjects,
          lifecycle.changedBySubjectId,
          "workflow lifecycle actor",
        );
      }
      workflowLifecycleByKey.set(key, lifecycle);
    }
    if (workflowLifecycleByKey.size !== workflowDefinitions.size) {
      throw new Error(
        "Workflow lifecycle export must contain exactly one record per workflow definition version.",
      );
    }
  }

  for (const assignment of data.workspaceWorkflowAssignments ?? []) {
    assertTenant(
      assignment.tenantId,
      tenantId,
      `workspace workflow assignment ${assignment.workspaceId}`,
    );
    const workspace = assertReferenced(
      workspaces,
      assignment.workspaceId,
      "workspace workflow assignment workspace",
    ) as Workspace;
    assertTenant(
      workspace.tenantId,
      tenantId,
      `workspace workflow assignment ${assignment.workspaceId}`,
    );
    const assignmentWorkflowKey = `${assignment.workflowDefinitionId}:${assignment.workflowDefinitionVersion}`;
    if (!workflowDefinitions.has(assignmentWorkflowKey)) {
      throw new Error(
        `Workspace workflow assignment ${assignment.workspaceId} references a missing workflow definition version.`,
      );
    }
    if (
      workflowLifecycleByKey.get(assignmentWorkflowKey)?.lifecycleState ===
      "retired"
    ) {
      throw new Error(
        `Workspace workflow assignment ${assignment.workspaceId} references a retired workflow version.`,
      );
    }
    assertReferenced(
      subjects,
      assignment.createdBySubjectId,
      "workspace workflow assignment creator",
    );
    assertReferenced(
      subjects,
      assignment.updatedBySubjectId,
      "workspace workflow assignment updater",
    );
  }

  const workspaceDefaultKeys = new Set<string>();
  for (const assignment of data.workspaceWorkflowAssignments ?? []) {
    if (!assignment.isDefault) continue;
    if (workspaceDefaultKeys.has(assignment.workspaceId)) {
      throw new Error(
        `Workspace ${assignment.workspaceId} has more than one default workflow in the export.`,
      );
    }
    workspaceDefaultKeys.add(assignment.workspaceId);
  }

  for (const instance of data.workflowInstances) {
    assertTenant(
      instance.tenantId,
      tenantId,
      `workflow instance ${instance.id}`,
    );
    const version = assertReferenced(
      documentVersions,
      instance.documentVersionId,
      "workflow document version",
    ) as DocumentVersion;
    if (version.documentId !== instance.documentId) {
      throw new Error(
        `Workflow instance ${instance.id} references mismatched document data.`,
      );
    }
    const definition = workflowDefinitions.get(
      `${instance.workflowDefinitionId}:${instance.workflowDefinitionVersion}`,
    );
    if (!definition || !definition.states.includes(instance.state)) {
      throw new Error(
        `Workflow instance ${instance.id} is not bound to a valid definition state.`,
      );
    }
  }

  for (const review of data.reviews) {
    assertTenant(review.tenantId, tenantId, `review ${review.id}`);
    const instance = assertReferenced(
      workflowInstances,
      review.workflowInstanceId,
      "review workflow instance",
    ) as WorkflowInstance;
    if (instance.documentVersionId !== review.documentVersionId) {
      throw new Error(
        `Review ${review.id} references the wrong document version.`,
      );
    }
    assertReferenced(subjects, review.actorSubjectId, "review actor");
  }

  for (const approval of data.approvals) {
    assertTenant(approval.tenantId, tenantId, `approval ${approval.id}`);
    assertCanonicalHash(approval.contentHash, `approval ${approval.id}`);
    const version = assertReferenced(
      documentVersions,
      approval.documentVersionId,
      "approval document version",
    ) as DocumentVersion;
    const instance = assertReferenced(
      workflowInstances,
      approval.workflowInstanceId,
      "approval workflow instance",
    ) as WorkflowInstance;
    assertReferenced(subjects, approval.actorSubjectId, "approval actor");

    if (
      version.documentId !== approval.documentId ||
      version.contentHash !== approval.contentHash ||
      instance.documentVersionId !== approval.documentVersionId ||
      instance.workflowDefinitionId !== approval.workflowDefinitionId ||
      instance.workflowDefinitionVersion !== approval.workflowDefinitionVersion
    ) {
      throw new Error(`Approval ${approval.id} does not bind exact evidence.`);
    }
  }

  for (const event of data.auditEvents) {
    assertTenant(event.tenantId, tenantId, `audit event ${event.id}`);
    assertReferenced(workspaces, event.workspaceId, "audit workspace");
    assertReferenced(subjects, event.actorSubjectId, "audit actor");
  }
}

const arrayFields = [
  "identitySubjects",
  "tenantMemberships",
  "workspaces",
  "roleDefinitions",
  "roleBindings",
  "documents",
  "documentVersions",
  "templates",
  "templateVersions",
  "workflowDefinitions",
  "workflowInstances",
  "reviews",
  "approvals",
  "auditEvents",
] as const;

function indexById<T extends { id: string }>(
  values: readonly T[],
  label: string,
): Map<string, T> {
  const index = new Map<string, T>();
  for (const value of values) {
    requireString(value.id, `${label}.id`);
    if (index.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}.`);
    }
    index.set(value.id, value);
  }
  return index;
}

function assertTenant(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} crosses the exported tenant boundary.`);
  }
}

function assertReferenced<T>(
  index: ReadonlyMap<string, T>,
  id: string,
  label: string,
): T {
  const value = index.get(id);
  if (!value) {
    throw new Error(`${label} references missing id ${id}.`);
  }
  return value;
}

function assertCanonicalHash(hash: string, label: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`${label} does not contain a canonical SHA-256 hash.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
