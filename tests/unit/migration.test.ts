import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const timestamp = "2026-08-10T12:00:00.000Z";

async function createDatabase(): Promise<DatabaseSync> {
  const migration = await readFile(
    new URL("../../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(migration);
  return database;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: (string | number | null)[]
): void {
  database.prepare(sql).run(...parameters);
}

function seedIdentityAndTenants(database: DatabaseSync): void {
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)",
    "subject-author",
    "Synthetic Author",
    "external",
    "author",
    timestamp,
  );
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)",
    "subject-approver",
    "Synthetic Approver",
    "external",
    "approver",
    timestamp,
  );

  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    "tenant-a",
    "Tenant A",
    "tenant-a",
    timestamp,
  );
  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    "tenant-b",
    "Tenant B",
    "tenant-b",
    timestamp,
  );

  for (const tenantId of ["tenant-a", "tenant-b"]) {
    run(
      database,
      "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      `membership-${tenantId}-author`,
      tenantId,
      "subject-author",
      timestamp,
    );
    run(
      database,
      "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      `membership-${tenantId}-approver`,
      tenantId,
      "subject-approver",
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    "workspace-a",
    "tenant-a",
    "Operations A",
    timestamp,
  );
  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    "workspace-b",
    "tenant-b",
    "Operations B",
    timestamp,
  );
}

function seedDocumentWorkflow(database: DatabaseSync): void {
  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, 'none', ?, ?)",
    "document-a",
    "tenant-a",
    "workspace-a",
    "Document A",
    timestamp,
    timestamp,
  );
  run(
    database,
    "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at) VALUES (?, ?, ?, 1, ?, 'r2', ?, ?, ?)",
    "version-a-1",
    "tenant-a",
    "document-a",
    `sha256:${"1".repeat(64)}`,
    "tenants/tenant-a/workspaces/workspace-a/documents/document-a/versions/version-a-1/content",
    "subject-author",
    timestamp,
  );
  run(
    database,
    "UPDATE documents SET current_version_id = ? WHERE id = ?",
    "version-a-1",
    "document-a",
  );

  const definition = JSON.stringify({
    states: ["draft", "approval", "approved"],
    transitions: [
      { from: "draft", to: "approval" },
      { from: "approval", to: "approved" },
    ],
  });
  run(
    database,
    "INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at) VALUES (?, ?, ?, 1, ?, ?)",
    "workflow-a",
    "tenant-a",
    "Workflow A",
    definition,
    timestamp,
  );
  run(
    database,
    "INSERT INTO workflow_instances (id, tenant_id, document_id, document_version_id, workflow_definition_id, workflow_definition_version, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'approved', ?, ?)",
    "workflow-instance-a",
    "tenant-a",
    "document-a",
    "version-a-1",
    "workflow-a",
    timestamp,
    timestamp,
  );
}

describe("D1/SQLite schema invariants", () => {
  it("rejects cross-tenant workspace references", async () => {
    const database = await createDatabase();
    seedIdentityAndTenants(database);

    expect(() =>
      run(
        database,
        "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, 'none', ?, ?)",
        "cross-tenant-document",
        "tenant-a",
        "workspace-b",
        "Must fail",
        timestamp,
        timestamp,
      ),
    ).toThrow();
  });

  it("ties current versions to the same document and tenant", async () => {
    const database = await createDatabase();
    seedIdentityAndTenants(database);
    seedDocumentWorkflow(database);

    run(
      database,
      "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, 'none', ?, ?)",
      "document-a-2",
      "tenant-a",
      "workspace-a",
      "Document A2",
      timestamp,
      timestamp,
    );
    run(
      database,
      "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at) VALUES (?, ?, ?, 1, ?, 'r2', ?, ?, ?)",
      "version-a2-1",
      "tenant-a",
      "document-a-2",
      `sha256:${"2".repeat(64)}`,
      "tenants/tenant-a/workspaces/workspace-a/documents/document-a-2/versions/version-a2-1/content",
      "subject-author",
      timestamp,
    );

    expect(() =>
      run(
        database,
        "UPDATE documents SET current_version_id = ? WHERE id = ?",
        "version-a2-1",
        "document-a",
      ),
    ).toThrow();
  });

  it("rejects approvals that do not match exact version evidence", async () => {
    const database = await createDatabase();
    seedIdentityAndTenants(database);
    seedDocumentWorkflow(database);

    expect(() =>
      run(
        database,
        "INSERT INTO approvals (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        "approval-invalid",
        "tenant-a",
        "document-a",
        "version-a-1",
        `sha256:${"f".repeat(64)}`,
        "subject-approver",
        "workflow-instance-a",
        "workflow-a",
        timestamp,
      ),
    ).toThrow(/approval must match/);

    expect(() =>
      run(
        database,
        "INSERT INTO approvals (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        "approval-valid",
        "tenant-a",
        "document-a",
        "version-a-1",
        `sha256:${"1".repeat(64)}`,
        "subject-approver",
        "workflow-instance-a",
        "workflow-a",
        timestamp,
      ),
    ).not.toThrow();
  });

  it("makes audit history append-only", async () => {
    const database = await createDatabase();
    seedIdentityAndTenants(database);

    run(
      database,
      "INSERT INTO audit_events (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "audit-1",
      "tenant-a",
      "workspace-a",
      "subject-author",
      "document.created",
      "document",
      "document-a",
      timestamp,
      "{}",
    );

    expect(() =>
      run(
        database,
        "UPDATE audit_events SET event_type = 'changed' WHERE id = ?",
        "audit-1",
      ),
    ).toThrow(/append-only/);
    expect(() =>
      run(database, "DELETE FROM audit_events WHERE id = ?", "audit-1"),
    ).toThrow(/append-only/);
  });
});
