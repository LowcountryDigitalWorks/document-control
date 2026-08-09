import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("D1 schema baseline", () => {
  it("enforces immutable audit events and exact approval evidence columns", async () => {
    const migration = await readFile(
      new URL("../../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE TRIGGER audit_events_no_update");
    expect(migration).toContain("CREATE TRIGGER audit_events_no_delete");
    expect(migration).toContain(
      "CREATE TRIGGER approvals_exact_version_insert",
    );
    expect(migration).toContain("document_version_id TEXT NOT NULL");
    expect(migration).toContain("workflow_definition_version INTEGER NOT NULL");
    expect(migration).toContain("content_hash TEXT NOT NULL");
  });
});
