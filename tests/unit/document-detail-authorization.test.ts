import { describe, expect, it } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import {
  AuthorizedDocumentDetailReadService,
  type DocumentDetailReader,
} from "../../src/application/authorized-document-detail-read-service";
import type { DocumentDetailEvidence } from "../../src/application/document-detail-read-service";

class DenyAuditPolicy implements AuthorizationPolicy {
  public readonly requests: AuthorizationRequest[] = [];

  public async assertAllowed(request: AuthorizationRequest): Promise<void> {
    this.requests.push(request);
    if (request.permission === "audit.read") {
      throw new AuthorizationDeniedError();
    }
  }
}

class NeverCalledReader implements DocumentDetailReader {
  public called = false;

  public async getDocumentDetail(): Promise<DocumentDetailEvidence> {
    this.called = true;
    throw new Error("Reader must not run after authorization denial.");
  }
}

describe("authorized document detail reads", () => {
  it("requires both document.read and audit.read before evidence is loaded", async () => {
    const policy = new DenyAuditPolicy();
    const reader = new NeverCalledReader();
    const service = new AuthorizedDocumentDetailReadService(reader, policy);

    await expect(
      service.getDocumentDetail({
        subjectId: "subject-owner",
        tenantId: "tenant-1",
        documentId: "document-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(policy.requests).toEqual([
      {
        subjectId: "subject-owner",
        tenantId: "tenant-1",
        documentId: "document-1",
        permission: "document.read",
      },
      {
        subjectId: "subject-owner",
        tenantId: "tenant-1",
        documentId: "document-1",
        permission: "audit.read",
      },
    ]);
    expect(reader.called).toBe(false);
  });
});
