import { describe, expect, it } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedTemplateDetailReadService } from "../../src/application/authorized-template-detail-read-service";
import type {
  DatabaseProvider,
  DatabaseResult,
} from "../../src/application/ports";
import { TemplateDetailReadService } from "../../src/application/template-detail-read-service";

class NeverCalledDatabase implements DatabaseProvider {
  public async query<Row>(): Promise<readonly Row[]> {
    throw new Error("Persistence must not run after authorization denial.");
  }

  public async execute(): Promise<DatabaseResult> {
    throw new Error("Persistence must not run after authorization denial.");
  }

  public async executeBatch(): Promise<readonly DatabaseResult[]> {
    throw new Error("Persistence must not run after authorization denial.");
  }
}

class RecordingDenyPolicy implements AuthorizationPolicy {
  public readonly requests: AuthorizationRequest[] = [];

  public async assertAllowed(request: AuthorizationRequest): Promise<void> {
    this.requests.push(request);
    throw new AuthorizationDeniedError();
  }
}

describe("AuthorizedTemplateDetailReadService", () => {
  it("requires template.read at the requested workspace before persistence executes", async () => {
    const policy = new RecordingDenyPolicy();
    const service = new AuthorizedTemplateDetailReadService(
      new TemplateDetailReadService(new NeverCalledDatabase()),
      policy,
    );

    await expect(
      service.getTemplateDetail({
        subjectId: "subject-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        templateId: "template-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(policy.requests).toEqual([
      {
        subjectId: "subject-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        permission: "template.read",
      },
    ]);
  });
});
