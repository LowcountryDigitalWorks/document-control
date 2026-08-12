import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const timestamp = "2026-08-12T17:00:00.000Z";

describe("document version change-summary migration", () => {
  it("backfills historical rows and enforces bounded immutable summaries for new rows", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(
      await readFile(
        new URL("../../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    database.exec(`
      INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
      VALUES ('subject-author', 'Avery Author', 'external', 'author', '${timestamp}');
      INSERT INTO tenants (id, name, slug, created_at)
      VALUES ('tenant-a', 'Tenant A', 'tenant-a', '${timestamp}');
      INSERT INTO workspaces (id, tenant_id, name, created_at)
      VALUES ('workspace-a', 'tenant-a', 'Operations', '${timestamp}');
      INSERT INTO documents
        (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at)
      VALUES ('document-a', 'tenant-a', 'workspace-a', 'Checklist', 'draft', NULL, 'none', '${timestamp}', '${timestamp}');
      INSERT INTO document_versions
        (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at)
      VALUES ('version-a-1', 'tenant-a', 'document-a', 1, 'sha256:${"1".repeat(64)}', 'r2', 'legacy-key', 'subject-author', '${timestamp}');
    `);

    const migration = await readFile(
      new URL(
        "../../migrations/0011_document_version_change_summary.sql",
        import.meta.url,
      ),
      "utf8",
    );
    database.exec(migration);

    const historical = database
      .prepare(
        "SELECT change_summary AS changeSummary FROM document_versions WHERE id = 'version-a-1'",
      )
      .get() as { changeSummary: string };
    expect(historical.changeSummary).toBe(
      "Historical version recorded before change-summary tracking.",
    );

    const insert = database.prepare(`INSERT INTO document_versions
      (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, change_summary, created_by_subject_id, created_at)
      VALUES (?, 'tenant-a', 'document-a', 2, ?, 'r2', ?, ?, 'subject-author', ?)`);
    expect(() =>
      insert.run(
        "version-a-2",
        `sha256:${"2".repeat(64)}`,
        "key-2",
        "Updated opening sequence.",
        timestamp,
      ),
    ).not.toThrow();

    expect(() =>
      database
        .prepare(
          `INSERT INTO document_versions
        (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at)
        VALUES ('version-a-3', 'tenant-a', 'document-a', 3, ?, 'r2', 'key-3', 'subject-author', ?)`,
        )
        .run(`sha256:${"3".repeat(64)}`, timestamp),
    ).toThrow(/change summary is required/);

    expect(() =>
      database
        .prepare(
          "UPDATE document_versions SET change_summary = ? WHERE id = 'version-a-2'",
        )
        .run("Rewritten reason"),
    ).toThrow(/change summary is immutable/);
  });
});
