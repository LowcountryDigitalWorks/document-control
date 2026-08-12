import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const timestamp = "2026-08-12T15:15:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

async function createDatabase(): Promise<DatabaseSync> {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0003_workflow_definition_immutability.sql",
    "0004_template_version_lifecycle_integrity.sql",
    "0009_template_revision_linearity.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  database.exec(`
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}');
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES ('creator-1', 'Creator One', 'external', 'creator-1', '${timestamp}');
    INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at)
    VALUES ('template-1', 'tenant-1', 'workspace-1', 'Checklist', NULL, '${timestamp}');
    INSERT INTO template_versions
      (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
       content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
    VALUES
      ('template-version-1', 'tenant-1', 'template-1', 1, 'published', '${hash}',
       'r2', 'tenant-1/workspace-1/template/template-1/version/1/object',
       'creator-1', 'synthetic', '${timestamp}', '${timestamp}');
    UPDATE templates SET current_version = 1 WHERE id = 'template-1';
  `);
  return database;
}

describe("template revision linearity migration", () => {
  it("preserves exact-ID INSERT OR IGNORE seed replay while guarding genuine new rows", async () => {
    const database = await createDatabase();

    expect(() =>
      database.exec(`
        INSERT OR IGNORE INTO template_versions
          (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
           content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
        VALUES
          ('template-version-1', 'tenant-1', 'template-1', 1, 'published', '${hash}',
           'r2', 'tenant-1/workspace-1/template/template-1/version/1/object',
           'creator-1', 'synthetic', '${timestamp}', '${timestamp}');
      `),
    ).not.toThrow();

    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM template_versions WHERE template_id = 'template-1'",
        )
        .get(),
    ).toEqual({ count: 1 });

    database.exec(`
      INSERT INTO template_versions
        (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
         content_provider, content_key, created_by_subject_id, provenance, created_at)
      VALUES
        ('template-version-2', 'tenant-1', 'template-1', 2, 'draft', '${hash}',
         'r2', 'tenant-1/workspace-1/template/template-1/version/1/object',
         'creator-1', 'derived unchanged', '${timestamp}');
      UPDATE templates SET current_version = 2 WHERE id = 'template-1';
    `);

    expect(() =>
      database.exec(`
        INSERT OR IGNORE INTO template_versions
          (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
           content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
        VALUES
          ('template-version-1', 'tenant-1', 'template-1', 1, 'published', '${hash}',
           'r2', 'tenant-1/workspace-1/template/template-1/version/1/object',
           'creator-1', 'synthetic', '${timestamp}', '${timestamp}');
      `),
    ).not.toThrow();

    expect(() =>
      database.exec(`
        INSERT INTO template_versions
          (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
           content_provider, content_key, created_by_subject_id, provenance, created_at)
        VALUES
          ('template-version-4', 'tenant-1', 'template-1', 4, 'retired', '${hash}',
           'r2', 'invalid-gap', 'creator-1', 'invalid gap', '${timestamp}');
      `),
    ).toThrow(/created in sequence/u);
  });
});
