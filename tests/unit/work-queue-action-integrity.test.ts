import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const timestamp = "2026-08-12T16:30:00.000Z";
const hashOne = `sha256:${"1".repeat(64)}`;
const hashTwo = `sha256:${"2".repeat(64)}`;

async function createDatabase(): Promise<DatabaseSync> {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0008_controlled_document_retirement.sql",
    "0010_current_workflow_action_integrity.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }

  database.exec(`
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES
      ('author-1', 'Avery Author', 'external', 'author-1', '${timestamp}'),
      ('reviewer-1', 'Riley Reviewer', 'external', 'reviewer-1', '${timestamp}'),
      ('approver-1', 'Alex Approver', 'external', 'approver-1', '${timestamp}');
    INSERT INTO tenants (id, name, slug, created_at)
      VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
      VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}');
    INSERT INTO documents
      (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at)
      VALUES ('document-1', 'tenant-1', 'workspace-1', 'Checklist', 'in_review', NULL, 'none', '${timestamp}', '${timestamp}');
    INSERT INTO document_versions
      (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at) VALUES
      ('version-1', 'tenant-1', 'document-1', 1, '${hashOne}', 'r2', 'version-1-key', 'author-1', '${timestamp}'),
      ('version-2', 'tenant-1', 'document-1', 2, '${hashTwo}', 'r2', 'version-2-key', 'author-1', '${timestamp}');
    UPDATE documents SET current_version_id = 'version-2' WHERE id = 'document-1';
    INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at)
      VALUES ('workflow-1', 'tenant-1', 'Review', 1,
        '{"states":["draft","review","approval","approved"],"transitions":[{"from":"draft","to":"review"},{"from":"review","to":"approval"},{"from":"approval","to":"approved"}]}',
        '${timestamp}');
    INSERT INTO workflow_instances
      (id, tenant_id, document_id, document_version_id, workflow_definition_id, workflow_definition_version, state, created_at, updated_at) VALUES
      ('instance-v1', 'tenant-1', 'document-1', 'version-1', 'workflow-1', 1, 'review', '${timestamp}', '${timestamp}'),
      ('instance-v2', 'tenant-1', 'document-1', 'version-2', 'workflow-1', 1, 'review', '${timestamp}', '${timestamp}');
  `);

  return database;
}

describe("current workflow action integrity migration", () => {
  it("blocks stale reviews and allows the current workflow version", async () => {
    const database = await createDatabase();
    expect(() =>
      database.exec(`
        INSERT INTO reviews
          (id, tenant_id, workflow_instance_id, document_version_id, actor_subject_id, decision, created_at)
        VALUES ('review-stale', 'tenant-1', 'instance-v1', 'version-1', 'reviewer-1', 'accepted', '${timestamp}');
      `),
    ).toThrow(/current workflow version/u);

    expect(() =>
      database.exec(`
        INSERT INTO reviews
          (id, tenant_id, workflow_instance_id, document_version_id, actor_subject_id, decision, created_at)
        VALUES ('review-current', 'tenant-1', 'instance-v2', 'version-2', 'reviewer-1', 'accepted', '${timestamp}');
      `),
    ).not.toThrow();
  });

  it("blocks stale approvals and allows the current workflow version", async () => {
    const database = await createDatabase();
    database.exec(
      "UPDATE workflow_instances SET state = 'approval' WHERE id IN ('instance-v1', 'instance-v2');",
    );

    expect(() =>
      database.exec(`
        INSERT INTO approvals
          (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at)
        VALUES ('approval-stale', 'tenant-1', 'document-1', 'version-1', '${hashOne}', 'approver-1', 'instance-v1', 'workflow-1', 1, '${timestamp}');
      `),
    ).toThrow(/current workflow version/u);

    expect(() =>
      database.exec(`
        INSERT INTO approvals
          (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id, workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at)
        VALUES ('approval-current', 'tenant-1', 'document-1', 'version-2', '${hashTwo}', 'approver-1', 'instance-v2', 'workflow-1', 1, '${timestamp}');
      `),
    ).not.toThrow();
  });
});
