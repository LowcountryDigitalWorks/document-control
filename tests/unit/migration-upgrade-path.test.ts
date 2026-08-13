import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyMigrationFiles,
  assertContiguousMigrationSequence,
  loadOrderedMigrations,
} from "../../scripts/migration-files";

const timestamp = "2026-08-12T12:00:00.000Z";
const priorChangeSummary = "Upgrade path state before session persistence.";

const expectedMigrationNames = [
  "0001_initial.sql",
  "0002_system_role_permissions.sql",
  "0003_workflow_definition_immutability.sql",
  "0004_template_version_lifecycle_integrity.sql",
  "0005_workspace_workflow_selection.sql",
  "0006_workflow_definition_lifecycle.sql",
  "0007_custom_role_retirement.sql",
  "0008_controlled_document_retirement.sql",
  "0009_template_revision_linearity.sql",
  "0010_current_workflow_action_integrity.sql",
  "0011_document_version_change_summary.sql",
  "0012_authenticated_session_verifiers.sql",
] as const;

type SqlParameter = string | number | null;

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlParameter[]
): void {
  database.prepare(sql).run(...parameters);
}

function seedPriorSupportedState(database: DatabaseSync): void {
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
    "subject-upgrade",
    "Upgrade Subject",
    "upgrade-subject",
    timestamp,
  );

  for (const [tenantId, workspaceId] of [
    ["tenant-upgrade-a", "workspace-upgrade-a"],
    ["tenant-upgrade-b", "workspace-upgrade-b"],
  ] as const) {
    run(
      database,
      "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      tenantId,
      tenantId,
      tenantId,
      timestamp,
    );
    run(
      database,
      "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      workspaceId,
      tenantId,
      workspaceId,
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
    "membership-upgrade-a",
    "tenant-upgrade-a",
    "subject-upgrade",
    timestamp,
  );
  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, 'none', ?, ?)",
    "document-upgrade",
    "tenant-upgrade-a",
    "workspace-upgrade-a",
    "Upgrade Document",
    timestamp,
    timestamp,
  );
  run(
    database,
    "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at, change_summary) VALUES (?, ?, ?, 1, ?, 'r2', ?, ?, ?, ?)",
    "version-upgrade-1",
    "tenant-upgrade-a",
    "document-upgrade",
    `sha256:${"1".repeat(64)}`,
    "tenants/tenant-upgrade-a/workspaces/workspace-upgrade-a/documents/document-upgrade/versions/version-upgrade-1/content",
    "subject-upgrade",
    timestamp,
    priorChangeSummary,
  );
  run(
    database,
    "UPDATE documents SET current_version_id = ? WHERE id = ?",
    "version-upgrade-1",
    "document-upgrade",
  );
  run(
    database,
    "INSERT INTO audit_events (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')",
    "audit-upgrade-1",
    "tenant-upgrade-a",
    "workspace-upgrade-a",
    "subject-upgrade",
    "document.created",
    "document",
    "document-upgrade",
    timestamp,
  );
}

describe("ordered D1/SQLite migration upgrade path", () => {
  it("keeps the repository migration plan explicit, contiguous, and deterministic", async () => {
    const migrations = await loadOrderedMigrations();

    expect(migrations.map((migration) => migration.name)).toEqual(
      expectedMigrationNames,
    );

    expect(() =>
      assertContiguousMigrationSequence([
        expectedMigrationNames[0],
        expectedMigrationNames[2],
      ]),
    ).toThrow(/expected 0002/u);
    expect(() =>
      assertContiguousMigrationSequence([
        expectedMigrationNames[1],
        expectedMigrationNames[0],
      ]),
    ).toThrow(/expected 0001/u);
  });

  it("applies the complete ordered sequence to an empty supported database", async () => {
    const database = new DatabaseSync(":memory:");
    applyMigrationFiles(database, await loadOrderedMigrations());

    const versionColumns = database
      .prepare("PRAGMA table_info(document_versions)")
      .all() as { name: string }[];
    expect(versionColumns.map((column) => column.name)).toContain(
      "change_summary",
    );

    const sessionColumns = database
      .prepare("PRAGMA table_info(authenticated_sessions)")
      .all() as { name: string }[];
    expect(sessionColumns.map((column) => column.name)).toEqual([
      "verifier",
      "subject_id",
      "authenticated_at",
      "created_at",
      "expires_at",
      "revoked_at",
      "replaced_by_verifier",
    ]);

    const trigger = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?",
      )
      .get("document_versions_change_summary_immutable") as
      { name: string } | undefined;
    expect(trigger?.name).toBe("document_versions_change_summary_immutable");

    database.close();
  });

  it("upgrades 0011 to the session-verifier schema while preserving records and invariants", async () => {
    const migrations = await loadOrderedMigrations();
    const database = new DatabaseSync(":memory:");

    applyMigrationFiles(database, migrations.slice(0, -1));
    seedPriorSupportedState(database);
    applyMigrationFiles(database, migrations.slice(-1));

    const version = database
      .prepare(
        "SELECT id, content_hash, change_summary FROM document_versions WHERE id = ?",
      )
      .get("version-upgrade-1") as {
      id: string;
      content_hash: string;
      change_summary: string;
    };
    expect(version).toEqual({
      id: "version-upgrade-1",
      content_hash: `sha256:${"1".repeat(64)}`,
      change_summary: priorChangeSummary,
    });

    const audit = database
      .prepare("SELECT event_type FROM audit_events WHERE id = ?")
      .get("audit-upgrade-1") as { event_type: string };
    expect(audit.event_type).toBe("document.created");

    run(
      database,
      "INSERT INTO authenticated_sessions (verifier, subject_id, authenticated_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      "a".repeat(64),
      "subject-upgrade",
      timestamp,
      timestamp,
      "2026-08-12T13:00:00.000Z",
    );
    const session = database
      .prepare(
        "SELECT verifier, subject_id FROM authenticated_sessions WHERE verifier = ?",
      )
      .get("a".repeat(64)) as { verifier: string; subject_id: string };
    expect(session).toEqual({
      verifier: "a".repeat(64),
      subject_id: "subject-upgrade",
    });

    expect(() =>
      run(
        database,
        "INSERT INTO authenticated_sessions (verifier, subject_id, authenticated_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        "raw-browser-token-is-not-a-verifier",
        "subject-upgrade",
        timestamp,
        timestamp,
        "2026-08-12T13:00:00.000Z",
      ),
    ).toThrow();

    expect(() =>
      run(
        database,
        "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', NULL, 'none', ?, ?)",
        "cross-tenant-upgrade",
        "tenant-upgrade-a",
        "workspace-upgrade-b",
        "Must fail",
        timestamp,
        timestamp,
      ),
    ).toThrow();

    expect(() =>
      run(
        database,
        "UPDATE audit_events SET event_type = 'changed' WHERE id = ?",
        "audit-upgrade-1",
      ),
    ).toThrow(/append-only/u);

    expect(() =>
      run(
        database,
        "UPDATE document_versions SET change_summary = ? WHERE id = ?",
        "Rewritten evidence",
        "version-upgrade-1",
      ),
    ).toThrow(/immutable/u);

    expect(() =>
      run(
        database,
        "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at) VALUES (?, ?, ?, 2, ?, 'r2', ?, ?, ?)",
        "version-upgrade-2-invalid",
        "tenant-upgrade-a",
        "document-upgrade",
        `sha256:${"2".repeat(64)}`,
        "tenants/tenant-upgrade-a/workspaces/workspace-upgrade-a/documents/document-upgrade/versions/version-upgrade-2-invalid/content",
        "subject-upgrade",
        timestamp,
      ),
    ).toThrow(/change summary/u);

    expect(() =>
      run(
        database,
        "INSERT INTO document_versions (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at, change_summary) VALUES (?, ?, ?, 2, ?, 'r2', ?, ?, ?, ?)",
        "version-upgrade-2",
        "tenant-upgrade-a",
        "document-upgrade",
        `sha256:${"2".repeat(64)}`,
        "tenants/tenant-upgrade-a/workspaces/workspace-upgrade-a/documents/document-upgrade/versions/version-upgrade-2/content",
        "subject-upgrade",
        timestamp,
        "Second controlled version after upgrade.",
      ),
    ).not.toThrow();

    database.close();
  });
});
