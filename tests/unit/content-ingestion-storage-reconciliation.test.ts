import { describe, expect, it } from "vitest";
import {
  ContentIngestionRecoveryRequiredError,
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
  const service = new ContentIngestionService(
    repository,
    store,
    new StubValidator(),
    new SequenceIds(),
    "r2",
  );
  return { store, service };
}

describe("content ingestion object-store reconciliation", () => {
  it("recovers an immutable object that committed before create returned an error", async () => {
    const { store, service } = fixture();
    store.persistThenFailCreate = true;
    const record = await service.initiate({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      displayFilename: "candidate.pdf",
      occurredAt: at,
    });

    await expect(
      service.receiveAndValidate({
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        actorSubjectId: "subject-a",
        ingestionId: record.id,
        bytes: pdfBytes("write-result-unknown"),
        occurredAt: at,
      }),
    ).rejects.toThrow(ContentIngestionRecoveryRequiredError);

    expect(store.objects.has(record.storageKey)).toBe(true);
    const recovered = await service.recover({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      ingestionId: record.id,
      occurredAt: "2026-08-13T16:01:00.000Z",
    });
    expect(recovered.state).toBe("accepted");
    expect(store.createCalls).toBe(1);
  });
});
