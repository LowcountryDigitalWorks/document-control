import { describe, expect, it } from "vitest";
import type {
  AuthorizationPolicy,
  AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedContentIngestionService } from "../../src/application/authorized-content-ingestion-service";
import { ContentIngestionService } from "../../src/application/content-ingestion";
import {
  MemoryIngestionRepository,
  MemoryStore,
  pdfBytes,
  SequenceIds,
  StubValidator,
} from "./content-ingestion-memory-support";

const at = "2026-08-13T16:00:00.000Z";
class RecordingAuthorization implements AuthorizationPolicy {
  public readonly requests: AuthorizationRequest[] = [];
  public deny = false;
  public async assertAllowed(request: AuthorizationRequest): Promise<void> {
    this.requests.push(request);
    if (this.deny) throw new Error("not authorized");
  }
}

function fixture() {
  const authorization = new RecordingAuthorization();
  const ingestion = new ContentIngestionService(
    new MemoryIngestionRepository(),
    new MemoryStore(),
    new StubValidator(),
    new SequenceIds(),
    "r2",
  );
  return {
    authorization,
    service: new AuthorizedContentIngestionService(ingestion, authorization),
  };
}

describe("authorized content ingestion", () => {
  it("rechecks document.version.create before receiving bytes", async () => {
    const { authorization, service } = fixture();
    const record = await service.initiate({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      displayFilename: "policy.pdf",
      occurredAt: at,
    });
    expect(authorization.requests[0]).toMatchObject({
      permission: "document.version.create",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
    });
    authorization.deny = true;
    await expect(
      service.receiveAndValidate({
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        actorSubjectId: "subject-a",
        ingestionId: record.id,
        bytes: pdfBytes(),
        occurredAt: at,
      }),
    ).rejects.toThrow("not authorized");
  });

  it("requires document.read again before accepted-content retrieval", async () => {
    const { authorization, service } = fixture();
    const record = await service.initiate({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      displayFilename: "policy.pdf",
      occurredAt: at,
    });
    await service.receiveAndValidate({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      ingestionId: record.id,
      bytes: pdfBytes(),
      occurredAt: at,
    });
    await service.getAcceptedContent({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      actorSubjectId: "subject-a",
      ingestionId: record.id,
    });
    expect(authorization.requests.at(-1)?.permission).toBe("document.read");
  });
});
