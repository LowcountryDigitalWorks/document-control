import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";
import { sha256 } from "../../src/domain/hash";

const timestamp = "2026-08-12T12:00:00.000Z";

type SqlValue = string | number | bigint | Uint8Array | null;
type Row = Record<string, SqlValue>;
type RecoveryTable =
  | "identity_subjects"
  | "tenants"
  | "tenant_memberships"
  | "workspaces"
  | "role_bindings"
  | "templates"
  | "template_versions"
  | "documents"
  | "document_versions"
  | "workflow_definitions"
  | "workflow_instances"
  | "approvals"
  | "audit_events";

const ids = {
  subject: "subject-recovery",
  tenant: "tenant-recovery",
  membership: "membership-recovery",
  workspace: "workspace-recovery",
  binding: "binding-recovery",
  template: "template-recovery",
  templateVersion: "template-version-recovery-1",
  document: "document-recovery",
  documentVersion: "document-version-recovery-1",
  workflow: "workflow-recovery",
  workflowInstance: "workflow-instance-recovery",
  approval: "approval-recovery",
  audit: "audit-recovery",
} as const;

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlValue[]
): void {
  database.prepare(sql).run(...parameters);
}

function row(database: DatabaseSync, table: RecoveryTable, id: string): Row {
  const result = database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | Row
    | undefined;
  if (!result) throw new Error(`Expected ${table} row ${id}.`);
  return result;
}

function insertRow(
  database: DatabaseSync,
  table: RecoveryTable,
  value: Row,
): void {
  const columns = Object.keys(value);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((column) => value[column] ?? null);
  database
    .prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    )
    .run(...values);
}

async function createCurrentDatabase(): Promise<DatabaseSync> {
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  return database;
}

async function seedRecoveryFixture(database: DatabaseSync) {
  const documentHash = await sha256(
    new TextEncoder().encode("synthetic document recovery content"),
  );
  const templateHash = await sha256(
    new TextEncoder().encode("synthetic template recovery content"),
  );

  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
    ids.subject,
    "Recovery Operator",
    ids.subject,
    timestamp,
  );
  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    ids.tenant,
    "Recovery Tenant",
    "recovery-tenant",
    timestamp,
  );
  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
    ids.membership,
    ids.tenant,
    ids.subject,
    timestamp,
  );
  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    ids.workspace,
    ids.tenant,
    "Recovery Workspace",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-document-owner', ?, ?, ?, ?)",
    ids.binding,
    ids.subject,
    ids.tenant,
    ids.workspace,
    timestamp,
  );

  run(
    database,
    "INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    ids.template,
    ids.tenant,
    ids.workspace,
    "Recovery Template",
    timestamp,
  );
  run(
    database,
    `INSERT INTO template_versions
       (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
        content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
     VALUES (?, ?, ?, 1, 'published', ?, 'r2', ?, ?, ?, ?, ?)`,
    ids.templateVersion,
    ids.tenant,
    ids.template,
    templateHash,
    `tenants/${ids.tenant}/workspaces/${ids.workspace}/templates/${ids.template}/versions/${ids.templateVersion}/content`,
    ids.subject,
    "Synthetic recovery fixture",
    timestamp,
    timestamp,
  );
  run(
    database,
    "UPDATE templates SET current_version = 1 WHERE id = ?",
    ids.template,
  );

  run(
    database,
    `INSERT INTO documents
       (id, tenant_id, workspace_id, title, status, current_version_id,
        source_template_id, source_template_version, source_template_hash,
        template_provenance, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', NULL, ?, 1, ?, 'approved_template', ?, ?)`,
    ids.document,
    ids.tenant,
    ids.workspace,
    "Recovery Document",
    ids.template,
    templateHash,
    timestamp,
    timestamp,
  );
  run(
    database,
    `INSERT INTO document_versions
       (id, tenant_id, document_id, version_number, content_hash, content_provider,
        content_key, created_by_subject_id, created_at, change_summary)
     VALUES (?, ?, ?, 1, ?, 'r2', ?, ?, ?, ?)`,
    ids.documentVersion,
    ids.tenant,
    ids.document,
    documentHash,
    `tenants/${ids.tenant}/workspaces/${ids.workspace}/documents/${ids.document}/versions/${ids.documentVersion}/content`,
    ids.subject,
    timestamp,
    "Initial synthetic recovery version.",
  );
  run(
    database,
    "UPDATE documents SET current_version_id = ?, status = 'approved' WHERE id = ?",
    ids.documentVersion,
    ids.document,
  );

  run(
    database,
    `INSERT INTO workflow_definitions
       (id, tenant_id, name, version, definition_json, created_at)
     VALUES (?, ?, 'Recovery Workflow', 1, ?, ?)`,
    ids.workflow,
    ids.tenant,
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
    `INSERT INTO workflow_instances
       (id, tenant_id, document_id, document_version_id, workflow_definition_id,
        workflow_definition_version, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'approved', ?, ?)`,
    ids.workflowInstance,
    ids.tenant,
    ids.document,
    ids.documentVersion,
    ids.workflow,
    timestamp,
    timestamp,
  );
  run(
    database,
    `INSERT INTO approvals
       (id, tenant_id, document_id, document_version_id, content_hash,
        actor_subject_id, workflow_instance_id, workflow_definition_id,
        workflow_definition_version, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ids.approval,
    ids.tenant,
    ids.document,
    ids.documentVersion,
    documentHash,
    ids.subject,
    ids.workflowInstance,
    ids.workflow,
    timestamp,
  );
  run(
    database,
    `INSERT INTO audit_events
       (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type,
        entity_id, occurred_at, payload_json)
     VALUES (?, ?, ?, ?, 'document.approved', 'document', ?, ?, '{}')`,
    ids.audit,
    ids.tenant,
    ids.workspace,
    ids.subject,
    ids.document,
    timestamp,
  );

  return { documentHash, templateHash };
}

function capture(database: DatabaseSync) {
  return {
    subject: row(database, "identity_subjects", ids.subject),
    tenant: row(database, "tenants", ids.tenant),
    membership: row(database, "tenant_memberships", ids.membership),
    workspace: row(database, "workspaces", ids.workspace),
    binding: row(database, "role_bindings", ids.binding),
    template: row(database, "templates", ids.template),
    templateVersion: row(database, "template_versions", ids.templateVersion),
    document: row(database, "documents", ids.document),
    documentVersion: row(database, "document_versions", ids.documentVersion),
    workflow: row(database, "workflow_definitions", ids.workflow),
    workflowInstance: row(database, "workflow_instances", ids.workflowInstance),
    approval: row(database, "approvals", ids.approval),
    audit: row(database, "audit_events", ids.audit),
  };
}

function restore(database: DatabaseSync, state: ReturnType<typeof capture>): void {
  insertRow(database, "identity_subjects", state.subject);
  insertRow(database, "tenants", state.tenant);
  insertRow(database, "tenant_memberships", state.membership);
  insertRow(database, "workspaces", state.workspace);
  insertRow(database, "role_bindings", state.binding);

  insertRow(database, "templates", { ...state.template, current_version: null });
  insertRow(database, "template_versions", state.templateVersion);
  run(
    database,
    "UPDATE templates SET current_version = ? WHERE id = ?",
    state.template.current_version ?? null,
    ids.template,
  );

  insertRow(database, "documents", {
    ...state.document,
    status: "draft",
    current_version_id: null,
  });
  insertRow(database, "document_versions", state.documentVersion);
  run(
    database,
    "UPDATE documents SET current_version_id = ?, status = ? WHERE id = ?",
    state.document.current_version_id ?? null,
    state.document.status ?? "draft",
    ids.document,
  );

  insertRow(database, "workflow_definitions", state.workflow);
  insertRow(database, "workflow_instances", state.workflowInstance);
  insertRow(database, "approvals", state.approval);
  insertRow(database, "audit_events", state.audit);
}

describe("local synthetic recovery drill", () => {
  it("rebuilds current SQLite state and revalidates critical evidence", async () => {
    const source = await createCurrentDatabase();
    const expectedHashes = await seedRecoveryFixture(source);
    const state = capture(source);

    const restored = await createCurrentDatabase();
    restore(restored, state);

    expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      row(restored, "document_versions", ids.documentVersion),
    ).toMatchObject({
      content_hash: expectedHashes.documentHash,
      change_summary: "Initial synthetic recovery version.",
    });
    expect(
      row(restored, "template_versions", ids.templateVersion).content_hash,
    ).toBe(expectedHashes.templateHash);
    expect(
      row(restored, "workflow_instances", ids.workflowInstance),
    ).toMatchObject({
      document_version_id: ids.documentVersion,
      workflow_definition_id: ids.workflow,
      workflow_definition_version: 1,
      state: "approved",
    });
    expect(row(restored, "approvals", ids.approval)).toMatchObject({
      document_version_id: ids.documentVersion,
      content_hash: expectedHashes.documentHash,
      workflow_instance_id: ids.workflowInstance,
    });
    expect(row(restored, "role_bindings", ids.binding)).toMatchObject({
      role_definition_id: "role-document-owner",
      subject_id: ids.subject,
      tenant_id: ids.tenant,
      workspace_id: ids.workspace,
    });
    expect(() =>
      run(
        restored,
        "UPDATE audit_events SET event_type = 'tampered' WHERE id = ?",
        ids.audit,
      ),
    ).toThrow(/append-only/u);
    expect(
      restored
        .prepare("PRAGMA table_info(document_versions)")
        .all()
        .some((column) => (column as { name: string }).name === "change_summary"),
    ).toBe(true);

    source.close();
    restored.close();
  });
});
