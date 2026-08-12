import { describe, expect, it } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedDocumentWorkflowService } from "../../src/application/authorized-document-workflow-service";
import { DocumentWorkflowService } from "../../src/application/document-workflow-service";
import type {
  DatabaseProvider,
  DatabaseResult,
} from "../../src/application/ports";

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

function createSubject(): {
  service: AuthorizedDocumentWorkflowService;
  policy: RecordingDenyPolicy;
} {
  const policy = new RecordingDenyPolicy();
  return {
    policy,
    service: new AuthorizedDocumentWorkflowService(
      new DocumentWorkflowService(new NeverCalledDatabase()),
      policy,
    ),
  };
}

const base = {
  tenantId: "tenant-1",
  actorSubjectId: "subject-1",
  occurredAt: "2026-08-10T20:30:00.000Z",
  auditEventId: "audit-1",
};

describe("authorized document workflow facade", () => {
  it("requires document.create before template-derived creation", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.createDocumentFromTemplate({
        ...base,
        workspaceId: "workspace-1",
        documentId: "document-1",
        title: "Document",
        templateId: "template-1",
        templateVersion: 1,
        versionId: "version-1",
        contentHash: `sha256:${"1".repeat(64)}`,
        contentKey: "unused-after-denial",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests).toEqual([
      {
        subjectId: "subject-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        permission: "document.create",
      },
    ]);
  });

  it("requires workflow.execute scoped by document before workflow start", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.startWorkflow({
        ...base,
        documentId: "document-1",
        workflowInstanceId: "workflow-instance-1",
        workflowDefinitionId: "workflow-definition-1",
        workflowDefinitionVersion: 1,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      documentId: "document-1",
      permission: "workflow.execute",
    });
  });

  it("requires workflow.execute scoped by workflow instance before transition", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.transition({
        ...base,
        workflowInstanceId: "workflow-instance-1",
        targetState: "review",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      workflowInstanceId: "workflow-instance-1",
      permission: "workflow.execute",
    });
  });

  it("requires document.review before review decisions", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.recordReview({
        ...base,
        workflowInstanceId: "workflow-instance-1",
        reviewId: "review-1",
        decision: "accepted",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      workflowInstanceId: "workflow-instance-1",
      permission: "document.review",
    });
  });

  it("requires document.approve before approval", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.approveCurrentVersion({
        ...base,
        workflowInstanceId: "workflow-instance-1",
        approvalId: "approval-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      workflowInstanceId: "workflow-instance-1",
      permission: "document.approve",
    });
  });

  it("requires document.version.create before a changed version", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.createChangedVersion({
        ...base,
        documentId: "document-1",
        versionId: "version-2",
        contentHash: `sha256:${"2".repeat(64)}`,
        contentKey: "unused-after-denial",
        changeSummary: "Synthetic controlled version change.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      documentId: "document-1",
      permission: "document.version.create",
    });
  });

  it("requires document.read before evidence access", async () => {
    const { service, policy } = createSubject();
    await expect(
      service.getEvidence({
        tenantId: "tenant-1",
        documentId: "document-1",
        actorSubjectId: "subject-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(policy.requests[0]).toMatchObject({
      documentId: "document-1",
      permission: "document.read",
    });
  });
});
