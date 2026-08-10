import {
  exportFormat,
  exportVersion,
  validatePortableExport,
  type PortableExportV1,
} from "./export";
import type { DatabaseProvider } from "./ports";
import type {
  Approval,
  AuditEvent,
  Document,
  DocumentStatus,
  DocumentVersion,
  IdentityProvider,
  IdentitySubject,
  Review,
  RoleBinding,
  RoleDefinition,
  RoleScope,
  Template,
  TemplateLifecycleState,
  TemplateProvenance,
  TemplateVersion,
  Tenant,
  TenantConfiguration,
  TenantMembership,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowTransition,
  Workspace,
} from "../domain/models";

type TenantRow = Tenant;
interface WorkspaceRow {
  id: string;
  tenantId: string;
  name: string;
}
interface IdentitySubjectRow {
  id: string;
  displayName: string;
  email: string | null;
  provider: IdentityProvider;
  providerSubject: string | null;
  createdAt: string;
}
interface MembershipRow {
  id: string;
  tenantId: string;
  subjectId: string;
  status: TenantMembership["status"];
  createdAt: string;
}
interface RoleDefinitionRow {
  id: string;
  tenantId: string | null;
  roleKey: string;
  name: string;
  scope: RoleScope;
  permissionsJson: string;
  isSystem: number;
  createdAt: string;
}
interface RoleBindingRow {
  id: string;
  roleDefinitionId: string;
  subjectId: string;
  tenantId: string | null;
  workspaceId: string | null;
  createdAt: string;
}
interface DocumentRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  status: DocumentStatus;
  currentVersionId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  sourceTemplateHash: string | null;
  templateProvenance: TemplateProvenance;
}
type DocumentVersionRow = DocumentVersion;
interface TemplateRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  currentVersion: number | null;
}
interface TemplateVersionRow {
  id: string;
  tenantId: string;
  templateId: string;
  versionNumber: number;
  lifecycleState: TemplateLifecycleState;
  contentHash: string;
  contentProvider: string;
  contentKey: string;
  createdBySubjectId: string;
  provenance: string;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
}
interface WorkflowDefinitionRow {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  definitionJson: string;
}
type WorkflowInstanceRow = WorkflowInstance;
interface ReviewRow {
  id: string;
  tenantId: string;
  workflowInstanceId: string;
  documentVersionId: string;
  actorSubjectId: string;
  decision: Review["decision"];
  comment: string | null;
  createdAt: string;
}
type ApprovalRow = Approval;
interface AuditRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  payloadJson: string;
}
interface TenantConfigurationRow {
  tenantId: string;
  permittedDataProfile: TenantConfiguration["permittedDataProfile"];
  brandingJson: string;
  terminologyJson: string;
  updatedAt: string;
}

export class PortableExportReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async createTenantExport(
    tenantId: string,
    exportedAt: string,
  ): Promise<PortableExportV1> {
    const tenant = await this.readTenant(tenantId);
    const tenantConfiguration = await this.readConfiguration(tenantId);

    const [
      identitySubjects,
      tenantMemberships,
      workspaces,
      roleDefinitions,
      roleBindings,
      documents,
      documentVersions,
      templates,
      templateVersions,
      workflowDefinitions,
      workflowInstances,
      reviews,
      approvals,
      auditEvents,
    ] = await Promise.all([
      this.readIdentitySubjects(tenantId),
      this.readMemberships(tenantId),
      this.readWorkspaces(tenantId),
      this.readRoleDefinitions(tenantId),
      this.readRoleBindings(tenantId),
      this.readDocuments(tenantId),
      this.readDocumentVersions(tenantId),
      this.readTemplates(tenantId),
      this.readTemplateVersions(tenantId),
      this.readWorkflowDefinitions(tenantId),
      this.readWorkflowInstances(tenantId),
      this.readReviews(tenantId),
      this.readApprovals(tenantId),
      this.readAuditEvents(tenantId),
    ]);

    const exported: PortableExportV1 = {
      format: exportFormat,
      version: exportVersion,
      exportedAt,
      tenant,
      tenantConfiguration,
      identitySubjects,
      tenantMemberships,
      workspaces,
      roleDefinitions,
      roleBindings,
      documents,
      documentVersions,
      templates,
      templateVersions,
      workflowDefinitions,
      workflowInstances,
      reviews,
      approvals,
      auditEvents,
    };
    validatePortableExport(exported);
    return exported;
  }

  private async readTenant(tenantId: string): Promise<Tenant> {
    const [row] = await this.database.query<TenantRow>(
      "SELECT id, name, slug FROM tenants WHERE id = ?",
      [tenantId],
    );
    if (!row) {
      throw new Error("Tenant was not found for export.");
    }
    return row;
  }

  private async readConfiguration(
    tenantId: string,
  ): Promise<TenantConfiguration> {
    const [row] = await this.database.query<TenantConfigurationRow>(
      `SELECT tenant_id AS tenantId,
              permitted_data_profile AS permittedDataProfile,
              branding_json AS brandingJson,
              terminology_json AS terminologyJson,
              updated_at AS updatedAt
       FROM tenant_configurations
       WHERE tenant_id = ?`,
      [tenantId],
    );
    if (!row) {
      throw new Error("Tenant configuration is required for portable export.");
    }
    return {
      tenantId: row.tenantId,
      permittedDataProfile: row.permittedDataProfile,
      branding: parseStringRecord(row.brandingJson, "branding_json"),
      terminology: parseStringRecord(row.terminologyJson, "terminology_json"),
      updatedAt: row.updatedAt,
    };
  }

  private async readIdentitySubjects(
    tenantId: string,
  ): Promise<IdentitySubject[]> {
    const rows = await this.database.query<IdentitySubjectRow>(
      `SELECT subject.id,
              subject.display_name AS displayName,
              subject.email,
              subject.provider,
              subject.provider_subject AS providerSubject,
              subject.created_at AS createdAt
       FROM identity_subjects AS subject
       WHERE subject.id IN (
         SELECT subject_id FROM tenant_memberships WHERE tenant_id = ?
         UNION SELECT created_by_subject_id FROM document_versions WHERE tenant_id = ?
         UNION SELECT created_by_subject_id FROM template_versions WHERE tenant_id = ?
         UNION SELECT actor_subject_id FROM reviews WHERE tenant_id = ?
         UNION SELECT actor_subject_id FROM approvals WHERE tenant_id = ?
         UNION SELECT actor_subject_id FROM audit_events WHERE tenant_id = ?
       )
       ORDER BY subject.id`,
      [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      email: row.email ?? undefined,
      provider: row.provider,
      providerSubject: row.providerSubject ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  private async readMemberships(tenantId: string): Promise<TenantMembership[]> {
    return this.database.query<MembershipRow>(
      `SELECT id,
              tenant_id AS tenantId,
              subject_id AS subjectId,
              status,
              created_at AS createdAt
       FROM tenant_memberships
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
  }

  private async readWorkspaces(tenantId: string): Promise<Workspace[]> {
    return this.database.query<WorkspaceRow>(
      `SELECT id, tenant_id AS tenantId, name
       FROM workspaces
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
  }

  private async readRoleDefinitions(
    tenantId: string,
  ): Promise<RoleDefinition[]> {
    const rows = await this.database.query<RoleDefinitionRow>(
      `SELECT id,
              tenant_id AS tenantId,
              role_key AS roleKey,
              name,
              scope,
              permissions_json AS permissionsJson,
              is_system AS isSystem,
              created_at AS createdAt
       FROM role_definitions
       WHERE tenant_id = ?
          OR id IN (
            SELECT role_definition_id
            FROM role_bindings
            WHERE tenant_id = ?
          )
       ORDER BY id`,
      [tenantId, tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId ?? undefined,
      key: row.roleKey,
      name: row.name,
      scope: row.scope,
      permissions: parseStringArray(row.permissionsJson, "permissions_json"),
      isSystem: row.isSystem === 1,
      createdAt: row.createdAt,
    }));
  }

  private async readRoleBindings(tenantId: string): Promise<RoleBinding[]> {
    const rows = await this.database.query<RoleBindingRow>(
      `SELECT id,
              role_definition_id AS roleDefinitionId,
              subject_id AS subjectId,
              tenant_id AS tenantId,
              workspace_id AS workspaceId,
              created_at AS createdAt
       FROM role_bindings
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      roleDefinitionId: row.roleDefinitionId,
      subjectId: row.subjectId,
      tenantId: row.tenantId ?? undefined,
      workspaceId: row.workspaceId ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  private async readDocuments(tenantId: string): Promise<Document[]> {
    const rows = await this.database.query<DocumentRow>(
      `SELECT id,
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
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
    return rows.map((row) => ({
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
    }));
  }

  private async readDocumentVersions(
    tenantId: string,
  ): Promise<DocumentVersion[]> {
    return this.database.query<DocumentVersionRow>(
      `SELECT id,
              tenant_id AS tenantId,
              document_id AS documentId,
              version_number AS versionNumber,
              content_hash AS contentHash,
              content_provider AS contentProvider,
              content_key AS contentKey,
              created_by_subject_id AS createdBySubjectId,
              created_at AS createdAt
       FROM document_versions
       WHERE tenant_id = ?
       ORDER BY document_id, version_number`,
      [tenantId],
    );
  }

  private async readTemplates(tenantId: string): Promise<Template[]> {
    const rows = await this.database.query<TemplateRow>(
      `SELECT id,
              tenant_id AS tenantId,
              workspace_id AS workspaceId,
              name,
              current_version AS currentVersion
       FROM templates
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      name: row.name,
      currentVersion: row.currentVersion ?? undefined,
    }));
  }

  private async readTemplateVersions(
    tenantId: string,
  ): Promise<TemplateVersion[]> {
    const rows = await this.database.query<TemplateVersionRow>(
      `SELECT id,
              tenant_id AS tenantId,
              template_id AS templateId,
              version_number AS versionNumber,
              lifecycle_state AS lifecycleState,
              content_hash AS contentHash,
              content_provider AS contentProvider,
              content_key AS contentKey,
              created_by_subject_id AS createdBySubjectId,
              provenance,
              created_at AS createdAt,
              published_at AS publishedAt,
              superseded_at AS supersededAt
       FROM template_versions
       WHERE tenant_id = ?
       ORDER BY template_id, version_number`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      templateId: row.templateId,
      versionNumber: row.versionNumber,
      lifecycleState: row.lifecycleState,
      contentHash: row.contentHash,
      contentProvider: row.contentProvider,
      contentKey: row.contentKey,
      createdBySubjectId: row.createdBySubjectId,
      provenance: row.provenance,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt ?? undefined,
      supersededAt: row.supersededAt ?? undefined,
    }));
  }

  private async readWorkflowDefinitions(
    tenantId: string,
  ): Promise<WorkflowDefinition[]> {
    const rows = await this.database.query<WorkflowDefinitionRow>(
      `SELECT id,
              tenant_id AS tenantId,
              name,
              version,
              definition_json AS definitionJson
       FROM workflow_definitions
       WHERE tenant_id = ?
       ORDER BY id, version`,
      [tenantId],
    );
    return rows.map((row) => {
      const definition = parseWorkflowDefinition(row.definitionJson);
      return {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        version: row.version,
        states: definition.states,
        transitions: definition.transitions,
      };
    });
  }

  private async readWorkflowInstances(
    tenantId: string,
  ): Promise<WorkflowInstance[]> {
    return this.database.query<WorkflowInstanceRow>(
      `SELECT id,
              tenant_id AS tenantId,
              document_id AS documentId,
              document_version_id AS documentVersionId,
              workflow_definition_id AS workflowDefinitionId,
              workflow_definition_version AS workflowDefinitionVersion,
              state
       FROM workflow_instances
       WHERE tenant_id = ?
       ORDER BY id`,
      [tenantId],
    );
  }

  private async readReviews(tenantId: string): Promise<Review[]> {
    const rows = await this.database.query<ReviewRow>(
      `SELECT id,
              tenant_id AS tenantId,
              workflow_instance_id AS workflowInstanceId,
              document_version_id AS documentVersionId,
              actor_subject_id AS actorSubjectId,
              decision,
              comment,
              created_at AS createdAt
       FROM reviews
       WHERE tenant_id = ?
       ORDER BY created_at, id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      workflowInstanceId: row.workflowInstanceId,
      documentVersionId: row.documentVersionId,
      actorSubjectId: row.actorSubjectId,
      decision: row.decision,
      comment: row.comment ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  private async readApprovals(tenantId: string): Promise<Approval[]> {
    return this.database.query<ApprovalRow>(
      `SELECT id,
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
       WHERE tenant_id = ?
       ORDER BY approved_at, id`,
      [tenantId],
    );
  }

  private async readAuditEvents(tenantId: string): Promise<AuditEvent[]> {
    const rows = await this.database.query<AuditRow>(
      `SELECT id,
              tenant_id AS tenantId,
              workspace_id AS workspaceId,
              actor_subject_id AS actorSubjectId,
              event_type AS eventType,
              entity_type AS entityType,
              entity_id AS entityId,
              occurred_at AS occurredAt,
              payload_json AS payloadJson
       FROM audit_events
       WHERE tenant_id = ?
       ORDER BY occurred_at, id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      actorSubjectId: row.actorSubjectId,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      occurredAt: row.occurredAt,
      payload: parseUnknownRecord(row.payloadJson, "payload_json"),
    }));
  }
}

function parseStringArray(
  serialized: string,
  label: string,
): readonly string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }
  return parsed;
}

function parseStringRecord(
  serialized: string,
  label: string,
): Readonly<Record<string, string>> {
  const parsed = parseUnknownRecord(serialized, label);
  if (Object.values(parsed).some((value) => typeof value !== "string")) {
    throw new Error(`${label} must contain only string values.`);
  }
  return parsed as Record<string, string>;
}

function parseUnknownRecord(
  serialized: string,
  label: string,
): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseWorkflowDefinition(serialized: string): {
  states: readonly string[];
  transitions: readonly WorkflowTransition[];
} {
  const parsed = parseUnknownRecord(serialized, "definition_json");
  if (
    !Array.isArray(parsed.states) ||
    parsed.states.some((value) => typeof value !== "string") ||
    !Array.isArray(parsed.transitions)
  ) {
    throw new Error("definition_json has an invalid workflow structure.");
  }
  const transitions = parsed.transitions.map((value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      typeof (value as Record<string, unknown>).from !== "string" ||
      typeof (value as Record<string, unknown>).to !== "string"
    ) {
      throw new Error("definition_json has an invalid workflow transition.");
    }
    const transition = value as Record<string, string>;
    return { from: transition.from, to: transition.to };
  });
  return { states: parsed.states as string[], transitions };
}
