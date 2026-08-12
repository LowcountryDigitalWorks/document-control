import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";
import { sha256 } from "../../src/domain/hash";

const timestamp = "2026-08-12T12:00:00.000Z";

type Row = Record<string, string | number | null>;
type SqlParameter = string | number | null;

interface SyntheticRecoveryState {
  subject: Row;
  tenant: Row;
  membership: Row;
  workspace: Row;
  roleBinding: Row;
  template: Row;
  templateVersion: Row;
  document: Row;
  documentVersion: Row;
  workflowDefinition: Row;
  workflowInstance: Row;
  approval: Row;
  auditEvent: Row;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlParameter[]
): void {
  database.prepare(sql).run(...parameters);
}

function one(database: DatabaseSync, sql: string, id: string): Row {
  const row = database.prepare(sql).get(id) as Row | undefined;
  if (!row) throw new Error(`Expected recovery row ${id} was not found.`);
  return row;
}

async function createCurrentDatabase(): Promise<DatabaseSync> {
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  return database;
}

async function seedSyntheticRecoveryState(
  database: DatabaseSync,
): Promise<{ documentHash: string; templateHash: string }> {
  const documentHash = await sha256(
    new TextEncoder().encode("synthetic document recovery content"),
  );
  const templateHash = await sha256(
    new TextEncoder().encode("synthetic template recovery content"),
  );

  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
    "subject-recovery",
    "Recovery Operator",
    "recovery-operator",
    timestamp,
  );
  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    "tenant-recovery",
    "Recovery Tenant",
    "recovery-tenant",
    timestamp,
  );
  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
    "membership-recovery",
    "tenant-recovery",
    "subject-recovery",
    timestamp,
  );
  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    "workspace-recovery",
    "tenant-recovery",
    "Recovery Workspace",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-document-owner', ?, ?, ?, ?)",
    "binding-recovery",
    "subject-recovery",
    "tenant-recovery",
    "workspace-recovery",
    timestamp,
  );

  run(
    database,
    "INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    "template-recovery",
    "tenant-recovery",
    "workspace-recovery",
    "Recovery Template",
    timestamp,
  );
  run(
    database,
    "INSERT INTO template_versions (id, tenant_id, template_id, version_number, lifecycle_state, content_hash, content_provider, content_key, created_by_subject_id, provenance, created_at, published_at, superseded_at) VALUES (?, ?, ?, 1, 'published', ?, 'r2', ?, ?, ?, ?, ?, NULL)",
    "template-version-recovery-1",
    "tenant-recovery",
    "template-recovery",
    templateHash,
    "tenants/tenant-recovery/workspaces/workspace-recovery/templates/template-recovery/versions/template-version-recovery-1/content",
    "subject-recovery",
    "synthetic recovery fixture",
    timestamp,
    timestamp,
  );
  run(
    database,
    "UPDATE templates SET current_version = 1 WHERE id = ?",
    "template-recovery",
  );

  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, source_template_id, source_template_version, source_template_hash, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, ?, 1, ?, 'approved_template', ?, ?)",
    "document-recovery",
    "tenant-recovery",
    "workspace-recovery",
    "Recovery Document",
    "template-recovery",
    templateHash,
    timestamp,
    timestamp,
  );
  run(
    database,
    "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at, change_summary) VALUES (?, ?, ?, 1, ?, 'r2', ?, ?, ?, ?)",
    "document-version-recovery-1",
    "tenant-recovery",
    "document-recovery",
    documentHash,
    "tenants/tenant-recovery/workspaces/workspace-recovery/documents/document-recovery/versions/document-version-recovery-1/content",
    "subject-recovery",
    timestamp,
    "Initial synthetic recovery version.",
  );
  run(
    database,
    "UPDATE documents SET current_version_id = ?, status = 'approved' WHERE id = ?",
    "document-version-recovery-1",
    "document-recovery",
  );

  run(
    database,
    "INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at) VALUES (?, ?, ?, 1, ?, ?)",
    "workflow-recovery",
    "tenant-recovery",
    "Recovery Workflow",
    JSON.stringify({
      states: ["draft", "approval", "approved"],
      transitions: [
        { from: "draft", to: "approval" },
        { from: "approval", to: "approved" },
      ],
    }),
    timestamp,
  );
  run(
    database,
    "INSERT INTO workflow_instances (id, tenant_id, document_id, document_version_id, workflow_definition_id, workflow_definition_version, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'approved', ?, ?)",
    "workflow-instance-recovery",
    "tenant-recovery",
    "document-recovery",
    "document-version-recovery-1",
    "workflow-recovery",
    timestamp,
    timestamp,
  );
  run(
    database,
    "INSERT INTO approvals (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
    "approval-recovery",
    "tenant-recovery",
    "document-recovery",
    "document-version-recovery-1",
    documentHash,
    "subject-recovery",
    "workflow-instance-recovery",
    "workflow-recovery",
    timestamp,
  );
  run(
    database,
    "INSERT INTO audit_events (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "audit-recovery",
    "tenant-recovery",
    "workspace-recovery",
    "subject-recovery",
    "document.approved",
    "document",
    "document-recovery",
    timestamp,
    JSON.stringify({ documentVersionId: "document-version-recovery-1" }),
  );

  return { documentHash, templateHash };
}

function captureSyntheticRecoveryState(
  database: DatabaseSync,
): SyntheticRecoveryState {
  return {
    subject: one(
      database,
      "SELECT * FROM identity_subjects WHERE id = ?",
      "subject-recovery",
    ),
    tenant: one(
      database,
      "SELECT * FROM tenants WHERE id = ?",
      "tenant-recovery",
    ),
    membership: one(
      database,
      "SELECT * FROM tenant_memberships WHERE id = ?",
      "membership-recovery",
    ),
    workspace: one(
      database,
      "SELECT * FROM workspaces WHERE id = ?",
      "workspace-recovery",
    ),
    roleBinding: one(
      database,
      "SELECT * FROM role_bindings WHERE id = ?",
      "binding-recovery",
    ),
    template: one(
      database,
      "SELECT * FROM templates WHERE id = ?",
      "template-recovery",
    ),
    templateVersion: one(
      database,
      "SELECT * FROM template_versions WHERE id = ?",
      "template-version-recovery-1",
    ),
    document: one(
      database,
      "SELECT * FROM documents WHERE id = ?",
      "document-recovery",
    ),
    documentVersion: one(
      database,
      "SELECT * FROM document_versions WHERE id = ?",
      "document-version-recovery-1",
    ),
    workflowDefinition: one(
      database,
      "SELECT * FROM workflow_definitions WHERE id = ? AND version = 1",
      "workflow-recovery",
    ),
    workflowInstance: one(
      database,
      "SELECT * FROM workflow_instances WHERE id = ?",
      "workflow-instance-recovery",
    ),
    approval: one(
      database,
      "SELECT * FROM approvals WHERE id = ?",
      "approval-recovery",
    ),
    auditEvent: one(
      database,
      "SELECT * FROM audit_events WHERE id = ?",
      "audit-recovery",
    ),
  };
}

function restoreSyntheticRecoveryState(
  database: DatabaseSync,
  state: SyntheticRecoveryState,
): void {
  const subject = state.subject;
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, email, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    String(subject.id),
    String(subject.display_name),
    subject.email === null ? null : String(subject.email),
    String(subject.provider),
    subject.provider_subject === null ? null : String(subject.provider_subject),
    String(subject.created_at),
  );

  const tenant = state.tenant;
  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    String(tenant.id),
    String(tenant.name),
    String(tenant.slug),
    String(tenant.created_at),
  );

  const membership = state.membership;
  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
    String(membership.id),
    String(membership.tenant_id),
    String(membership.subject_id),
    String(membership.status),
    String(membership.created_at),
  );

  const workspace = state.workspace;
  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    String(workspace.id),
    String(workspace.tenant_id),
    String(workspace.name),
    String(workspace.created_at),
  );

  const binding = state.roleBinding;
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    String(binding.id),
    String(binding.role_definition_id),
    String(binding.subject_id),
    String(binding.tenant_id),
    String(binding.workspace_id),
    String(binding.created_at),
  );

  const template = state.template;
  run(
    database,
    "INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    String(template.id),
    String(template.tenant_id),
    String(template.workspace_id),
    String(template.name),
    String(template.created_at),
  );

  const templateVersion = state.templateVersion;
  run(
    database,
    "INSERT INTO template_versions (id, tenant_id, template_id, version_number, lifecycle_state, content_hash, content_provider, content_key, created_by_subject_id, provenance, created_at, published_at, superseded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(templateVersion.id),
    String(templateVersion.tenant_id),
    String(templateVersion.template_id),
    Number(templateVersion.version_number),
    String(templateVersion.lifecycle_state),
    String(templateVersion.content_hash),
    String(templateVersion.content_provider),
    String(templateVersion.content_key),
    String(templateVersion.created_by_subject_id),
    String(templateVersion.provenance),
    String(templateVersion.created_at),
    templateVersion.published_at === null
      ? null
      : String(templateVersion.published_at),
    templateVersion.superseded_at === null
      ? null
      : String(templateVersion.superseded_at),
  );
  run(
    database,
    "UPDATE templates SET current_version = ? WHERE id = ?",
    Number(template.current_version),
    String(template.id),
  );

  const document = state.document;
  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, source_template_id, source_template_version, source_template_hash, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)",
    String(document.id),
    String(document.tenant_id),
    String(document.workspace_id),
    String(document.title),
    String(document.status),
    String(document.source_template_id),
    Number(document.source_template_version),
    String(document.source_template_hash),
    String(document.template_provenance),
    String(document.created_at),
    String(document.updated_at),
  );

  const documentVersion = state.documentVersion;
  run(
    database,
    "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at, change_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(documentVersion.id),
    String(documentVersion.tenant_id),
    String(documentVersion.document_id),
    Number(documentVersion.version_number),
    String(documentVersion.content_hash),
    String(documentVersion.content_provider),
    String(documentVersion.content_key),
    String(documentVersion.created_by_subject_id),
    String(documentVersion.created_at),
    String(documentVersion.change_summary),
  );
  run(
    database,
    "UPDATE documents SET current_version_id = ? WHERE id = ?",
    String(document.current_version_id),
    String(document.id),
  );

  const definition = state.workflowDefinition;
  run(
    database,
    "INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    String(definition.id),
    String(definition.tenant_id),
    String(definition.name),
    Number(definition.version),
    String(definition.definition_json),
    String(definition.created_at),
  );

  const instance = state.workflowInstance;
  run(
    database,
    "INSERT INTO workflow_instances (id, tenant_id, document_id, document_version_id, workflow_definition_id, workflow_definition_version, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(instance.id),
    String(instance.tenant_id),
    String(instance.document_id),
    String(instance.document_version_id),
    String(instance.workflow_definition_id),
    Number(instance.workflow_definition_version),
    String(instance.state),
    String(instance.created_at),
    String(instance.updated_at),
  );

  const approval = state.approval;
  run(
    database,
    "INSERT INTO approvals (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(approval.id),
    String(approval.tenant_id),
    String(approval.document_id),
    String(approval.document_version_id),
    String(approval.content_hash),
    String(approval.actor_subject_id),
    String(approval.workflow_instance_id),
    String(approval.workflow_definition_id),
    Number(approval.workflow_definition_version),
    String(approval.approved_at),
  );

  const audit = state.auditEvent;
  run(
    database,
    "INSERT INTO audit_events (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(audit.id),
    String(audit.tenant_id),
    String(audit.workspace_id),
    String(audit.actor_subject_id),
    String(audit.event_type),
    String(audit.entity_type),
    String(audit.entity_id),
    String(audit.occurred_at),
    String(audit.payload_json),
  );
}

describe("local synthetic recovery drill", () => {
  it("rebuilds migrated SQLite state and revalidates critical evidence", async () => {
    const source = await createCurrentDatabase();
    const expectedHashes = await seedSyntheticRecoveryState(source);
    const captured = captureSyntheticRecoveryState(source);

    const restored = await createCurrentDatabase();
    restoreSyntheticRecoveryState(restored, captured);

    const foreignKeyProblems = restored.prepare("PRAGMA foreign_key_check").all();
    expect(foreignKeyProblems).toEqual([]);

    const restoredVersion = one(
      restored,
      "SELECT content_hash, change_summary FROM document_versions WHERE id = ?",
      "document-version-recovery-1",
    );
    expect(restoredVersion.content_hash).toBe(expectedHashes.documentHash);
    expect(restoredVersion.change_summary).toBe(
      "Initial synthetic recovery version.",
    );

    const restoredTemplateVersion = one(
      restored,
      "SELECT content_hash FROM template_versions WHERE id = ?",
      "template-version-recovery-1",
    );
    expect(restoredTemplateVersion.content_hash).toBe(expectedHashes.templateHash);

    const restoredWorkflow = one(
      restored,
      "SELECT document_version_id, workflow_definition_id, workflow_definition_version, state FROM workflow_instances WHERE id = ?",
      "workflow-instance-recovery",
    );
    expect(restoredWorkflow).toMatchObject({
      document_version_id: "document-version-recovery-1",
      workflow_definition_id: "workflow-recovery",
      workflow_definition_version: 1,
      state: "approved",
    });

    const restoredApproval = one(
      restored,
      "SELECT document_version_id, content_hash, workflow_instance_id FROM approvals WHERE id = ?",
      "approval-recovery",
    );
    expect(restoredApproval).toMatchObject({
      document_version_id: "document-version-recovery-1",
      content_hash: expectedHashes.documentHash,
      workflow_instance_id: "workflow-instance-recovery",
    });

    const restoredAuthorization = one(
      restored,
      "SELECT role_definition_id, subject_id, tenant_id, workspace_id FROM role_bindings WHERE id = ?",
      "binding-recovery",
    );
    expect(restoredAuthorization).toMatchObject({
      role_definition_id: "role-document-owner",
      subject_id: "subject-recovery",
      tenant_id: "tenant-recovery",
      workspace_id: "workspace-recovery",
    });

    expect(() =>
      run(
        restored,
        "UPDATE audit_events SET event_type = 'tampered' WHERE id = ?",
        "audit-recovery",
      ),
    ).toThrow(/append-only/u);

    const schemaColumn = restored
      .prepare("PRAGMA table_info(document_versions)")
      .all()
      .find((column) => (column as { name: string }).name === "change_summary");
    expect(schemaColumn).toBeDefined();

    source.close();
    restored.close();
  });
});
