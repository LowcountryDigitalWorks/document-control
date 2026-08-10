import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedReviewApprovalQueueReadService } from "../../src/application/authorized-review-approval-queue-read-service";
import type { ReviewApprovalQueueReadService } from "../../src/application/review-approval-queue-read-service";

const context = {
  subjectId: "subject-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(denyPermission?: string): {
  service: AuthorizedReviewApprovalQueueReadService;
  assertions: AuthorizationRequest[];
  listQueue: ReturnType<typeof vi.fn>;
} {
  const assertions: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      assertions.push(request);
      if (request.permission === denyPermission) {
        throw new AuthorizationDeniedError();
      }
    },
  };
  const listQueue = vi.fn().mockResolvedValue([]);
  const read = { listQueue } as unknown as ReviewApprovalQueueReadService;
  return {
    service: new AuthorizedReviewApprovalQueueReadService(read, authorization),
    assertions,
    listQueue,
  };
}

describe("AuthorizedReviewApprovalQueueReadService", () => {
  it("requires document.read and document.review before listing review work", async () => {
    const harness = createHarness();

    await harness.service.listReviewQueue(context);

    expect(harness.assertions).toEqual([
      {
        ...context,
        permission: "document.read",
      },
      {
        ...context,
        permission: "document.review",
      },
    ]);
    expect(harness.listQueue).toHaveBeenCalledWith(
      "tenant-1",
      "workspace-1",
      "review",
    );
  });

  it("requires document.read and document.approve before listing approval work", async () => {
    const harness = createHarness();

    await harness.service.listApprovalQueue(context);

    expect(harness.assertions).toEqual([
      {
        ...context,
        permission: "document.read",
      },
      {
        ...context,
        permission: "document.approve",
      },
    ]);
    expect(harness.listQueue).toHaveBeenCalledWith(
      "tenant-1",
      "workspace-1",
      "approval",
    );
  });

  it("does not query queue data when document.read is denied", async () => {
    const harness = createHarness("document.read");

    await expect(harness.service.listReviewQueue(context)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    expect(harness.assertions).toHaveLength(1);
    expect(harness.listQueue).not.toHaveBeenCalled();
  });

  it("does not query queue data when the action permission is denied", async () => {
    const harness = createHarness("document.approve");

    await expect(
      harness.service.listApprovalQueue(context),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(harness.assertions).toHaveLength(2);
    expect(harness.listQueue).not.toHaveBeenCalled();
  });
});
