import { describe, expect, it } from "vitest";
import {
  CONTENT_INGESTION_MAX_BYTES,
  CONTENT_INGESTION_MAX_IN_FLIGHT_PER_WORKSPACE,
  ContentIngestionInputError,
  ContentIngestionNotAvailableError,
  ContentIngestionService,
  normalizeDeclaredMediaType,
  normalizeDisplayFilename,
} from "../../src/application/content-ingestion";
import { sha256 } from "../../src/domain/hash";
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
  const validator = new StubValidator();
  const service = new ContentIngestionService(repository, store, validator, new SequenceIds(), "r2");
  return { repository, store, validator, service };
}

async function initiate(service: ContentIngestionService) {
  return service.initiate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", displayFilename: "policy.pdf", declaredMediaType: "application/pdf", occurredAt: at });
}

describe("content ingestion lifecycle", () => {
  it("bounds untrusted metadata and never uses filename as storage identity", async () => {
    expect(normalizeDisplayFilename("  policy.pdf  ")).toBe("policy.pdf");
    expect(normalizeDeclaredMediaType(" Application/PDF ")).toBe("application/pdf");
    for (const unsafe of ["../policy.pdf", "folder/policy.pdf", "folder\\policy.pdf", ".", "..", `x${String.fromCharCode(0)}.pdf`]) {
      expect(() => normalizeDisplayFilename(unsafe)).toThrow(ContentIngestionInputError);
    }
    expect(() => normalizeDeclaredMediaType("application/pdf; charset=utf-8")).toThrow(ContentIngestionInputError);
    const { service } = fixture();
    const record = await initiate(service);
    expect(record.storageKey).toBe("tenants/tenant-a/workspaces/workspace-a/content-ingestions/generated-1/staged-content");
    expect(record.storageKey).not.toContain("policy.pdf");
  });

  it("enforces size and in-flight limits before storage", async () => {
    const { repository, store, service } = fixture();
    repository.inFlightOverride = CONTENT_INGESTION_MAX_IN_FLIGHT_PER_WORKSPACE;
    await expect(initiate(service)).rejects.toThrow(/in-flight/u);
    repository.inFlightOverride = null;
    const record = await initiate(service);
    await expect(service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: new ArrayBuffer(CONTENT_INGESTION_MAX_BYTES + 1), occurredAt: at })).rejects.toThrow(ContentIngestionInputError);
    expect(store.createCalls).toBe(0);
  });

  it("persists SHA-256 and exposes only accepted, integrity-verified content", async () => {
    const { repository, store, service } = fixture();
    const record = await initiate(service);
    const bytes = pdfBytes();
    const accepted = await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes, occurredAt: at });
    const expected = await sha256(new Uint8Array(bytes));
    expect(accepted).toMatchObject({ state: "accepted", contentHash: expected, byteLength: bytes.byteLength, acceptedMediaType: "application/pdf" });
    expect(store.objects.get(record.storageKey)?.contentType).toBe("application/octet-stream");
    const retrieved = await service.getAcceptedContent({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id });
    expect(retrieved.contentHash).toBe(expected);
    expect(retrieved.contentType).toBe("application/pdf");
    expect(repository.events.map((event) => event.type)).toEqual(["content.intake.initiated","content.intake.received","content.intake.staged","content.accepted"]);
    store.tamperRead = true;
    await expect(service.getAcceptedContent({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id })).rejects.toThrow(ContentIngestionNotAvailableError);
  });

  it("keeps rejected and storage-failed candidates unavailable", async () => {
    const { store, validator, service } = fixture();
    validator.result = { outcome: "rejected", reason: "unsupported_content" };
    let record = await initiate(service);
    expect((await service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: at })).state).toBe("rejected");
    await expect(service.getAcceptedContent({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id })).rejects.toThrow(ContentIngestionNotAvailableError);

    const other = fixture();
    other.store.failCreate = true;
    record = await initiate(other.service);
    const failed = await other.service.receiveAndValidate({ tenantId: "tenant-a", workspaceId: "workspace-a", actorSubjectId: "subject-a", ingestionId: record.id, bytes: pdfBytes(), occurredAt: at });
    expect(failed).toMatchObject({ state: "processing_failed", failureCode: "storage_write_failed" });
  });
});
