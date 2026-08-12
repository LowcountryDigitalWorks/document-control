import { describe, expect, it } from "vitest";
import { serializeAuditLogCsv } from "../../src/application/audit-log-export";
import type { AuditLogItem } from "../../src/application/audit-log-read-service";

function event(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: "audit-1",
    eventType: "workflow.started",
    entityType: "workflow",
    entityId: "workflow-1",
    actorSubjectId: "subject-1",
    actorName: "Avery Auditor",
    occurredAt: "2026-08-12T15:00:00.000Z",
    payloadSummary: ["Version: 1", "Approved: false"],
    ...overrides,
  };
}

describe("serializeAuditLogCsv", () => {
  it("serializes the bounded audit summary columns in input order", () => {
    const csv = serializeAuditLogCsv([
      event(),
      event({
        id: "audit-2",
        eventType: "document.version.approved",
        entityType: "document_version",
        entityId: "version-2",
        actorName: 'Alex "Approver", Jr.',
        occurredAt: "2026-08-12T15:01:00.000Z",
        payloadSummary: ["Version: 2"],
      }),
    ]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    const rows = csv.slice(1).trimEnd().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(
      '"occurred_at","event_type","entity_type","entity_id","actor","evidence_summary"',
    );
    expect(rows[1]).toContain('"workflow.started"');
    expect(rows[2]).toContain('"document.version.approved"');
    expect(rows[2]).toContain('"Alex ""Approver"", Jr."');
  });

  it("neutralizes spreadsheet formula prefixes without changing ordinary text", () => {
    const csv = serializeAuditLogCsv([
      event({
        actorName: '=HYPERLINK("https://example.invalid")',
        entityId: "+SUM(1,1)",
      }),
    ]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM(1,1)");
    expect(csv).toContain('"workflow.started"');
  });

  it("exports only the already-summarized evidence supplied by the read model", () => {
    const csv = serializeAuditLogCsv([
      event({ payloadSummary: ["Decision: accepted", "Version: 1"] }),
    ]);

    expect(csv).toContain("Decision: accepted | Version: 1");
    expect(csv).not.toContain("payload_json");
    expect(csv).not.toContain("actor_subject_id");
  });
});
