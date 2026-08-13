import { describe, expect, it } from "vitest";
import {
  ContentIngestionRecoveryRequiredError,
  ContentIngestionRetryMismatchError,
  ContentIngestionService,
} from "../../src/application/content-ingestion";
import {
  MemoryIngestionRepository,
  MemoryStore,
  pdfBytes,
  SequenceIds,
  StubValidator,
} from "./content-ingestion-memory-support";

const at = "2026-08-13T16:00:00.000Z";

function fixture() {
  const repository = new MemoryIngestionRepository();
  const store = new MemoryStore();
  const service = new ContentIngestionService(repository, store, new StubValidator(), new SequenceIds(), "r2");
  return { repository, store, service };
}

async function initiated(service: ContentIngestionService) {
  return service.initiate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", displayFilename: "policy.pdf", occurredAt: at });
}

describe("content ingestion recovery and evidence", () => {
  it("recovers storage-success / persistence-failure without duplicating immutable bytes", async () => {
    const { repository, store, service } = fixture();
    repository.failStagedOnce = true;
    const record = await initiated(service);
    const bytes = pdfBytes();
    await expect(service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes, occurredAt: at })).rejects.toThrow(ContentIngestionRecoveryRequiredError);
    expect(store.createCalls).toBe(1);
    const recovered = await service.recover({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, occurredAt: "2026-08-13T16:01:00.000Z" });
    expect(recovered.state).toBe("accepted");
    expect(store.createCalls).toBe(1);
  });

  it("rejects mismatched retry bytes while same-byte retry resumes safely", async () => {
    const { repository, store, service } = fixture();
    repository.failStagedOnce = true;
    const record = await initiated(service);
    const bytes = pdfBytes("same");
    await expect(service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes, occurredAt: at })).rejects.toThrow(ContentIngestionRecoveryRequiredError);
    await expect(service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes("different"), occurredAt: at })).rejects.toThrow(ContentIngestionRetryMismatchError);
    const accepted = await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes, occurredAt: at });
    expect(accepted.state).toBe("accepted");
    expect(store.createCalls).toBe(1);
  });

  it("keeps audit evidence distinct and excludes bytes, filenames, and secret-shaped fields", async () => {
    const { repository, service } = fixture();
    const record = await initiated(service);
    await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes("SENSITIVE SYNTHETIC PAYLOAD"), occurredAt: at });
    const serialized = JSON.stringify(repository.events);
    expect(serialized).not.toContain("SENSITIVE SYNTHETIC PAYLOAD");
    expect(serialized).not.toContain("policy.pdf");
    expect(serialized).not.toMatch(/bearer|session|authorization[_-]?code|password|secret/i);
    expect(repository.events.map((event) => event.type)).toEqual(["content.intake.initiated","content.intake.received","content.intake.staged","content.accepted"]);
  });

  it("fails closed when tenant/workspace selectors do not match application-owned scope", async () => {
    const { service } = fixture();
    const record = await initiated(service);
    await expect(service.receiveAndValidate({ tenantId: "tenant-b", workspaceId: "workspace-b", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: at })).rejects.toThrow(/available/i);
  });
});
