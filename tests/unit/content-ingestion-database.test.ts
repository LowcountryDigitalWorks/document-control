import { describe, expect, it } from "vitest";
import { databaseFixture, run, timestamp } from "./content-ingestion-database-support";
import { pdfBytes } from "./content-ingestion-memory-support";

async function initiated() {
  const fixture = await databaseFixture();
  const record = await fixture.service.initiate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", displayFilename: "policy.pdf", declaredMediaType: "application/pdf", occurredAt: timestamp });
  return { ...fixture, record };
}

describe("content ingestion D1/SQLite boundary", () => {
  it("enforces tenant/workspace ownership in both lookup and database constraints", async () => {
    const { database, repository, record } = await initiated();
    await expect(repository.find("tenant-b", "workspace-b", record.id)).resolves.toBeNull();
    expect(() => run(database,
      `INSERT INTO content_ingestions
       (id, tenant_id, workspace_id, initiating_subject_id, display_filename, state, storage_provider, storage_key, created_at, last_event_id, last_actor_subject_id, last_event_at)
       VALUES (?, ?, ?, ?, ?, 'intake_initiated', 'r2', ?, ?, ?, ?, ?)`,
      "cross", "tenant-a", "workspace-b", "subject-a", "x.pdf",
      "tenants/tenant-a/workspaces/workspace-b/content-ingestions/cross/staged-content",
      timestamp, "event-cross", "subject-a", timestamp,
    )).toThrow();
    database.close();
  });

  it("rechecks live membership before candidate bytes can be staged", async () => {
    const { database, service, record } = await initiated();
    run(database, "UPDATE tenant_memberships SET status = 'suspended' WHERE id = ?", "membership-a");
    await expect(service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: timestamp })).rejects.toThrow(/not authorized/i);
    const stored = database.prepare("SELECT content_hash AS hash, state FROM content_ingestions WHERE id = ?").get(record.id) as { hash: string | null; state: string };
    expect(stored).toEqual({ hash: null, state: "intake_initiated" });
    database.close();
  });

  it("persists accepted integrity metadata and database-atomic minimized audit evidence", async () => {
    const { database, service, record } = await initiated();
    const accepted = await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: timestamp });
    expect(accepted.state).toBe("accepted");
    expect(accepted.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const events = database.prepare("SELECT event_type AS type, payload_json AS payload FROM audit_events WHERE entity_type = 'content_ingestion' ORDER BY rowid").all() as { type: string; payload: string }[];
    expect(events.map((event) => event.type)).toEqual(["content.intake.initiated","content.intake.received","content.intake.staged","content.accepted"]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("policy.pdf");
    expect(serialized).not.toContain("%PDF");
    expect(serialized).not.toMatch(/bearer|session|authorization[_-]?code|password|secret/i);
    database.close();
  });

  it("blocks terminal rewrites, ownership relinking, event-cursor rewriting, and deletion", async () => {
    const { database, service, record } = await initiated();
    await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: timestamp });
    expect(() => run(database, "UPDATE content_ingestions SET state = 'validation_pending' WHERE id = ?", record.id)).toThrow(/lifecycle transition/i);
    expect(() => run(database, "UPDATE content_ingestions SET storage_key = ? WHERE id = ?", "unsafe/relink", record.id)).toThrow(/immutable/i);
    expect(() => run(database, "UPDATE content_ingestions SET last_event_id = ? WHERE id = ?", "event-rewrite", record.id)).toThrow(/event cursor/i);
    expect(() => run(database, "DELETE FROM content_ingestions WHERE id = ?", record.id)).toThrow(/disposition/i);
    database.close();
  });
});
