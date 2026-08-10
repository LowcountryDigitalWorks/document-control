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

function createHarness(deny = false): {
  service: AuthorizedReviewApprovalQueueReadService;
  assertions: AuthorizationRequest[];
  listQueue: ReturnType<typeof vi.fn>;
} {
  const assertions: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      assertions.push(request);
      if (deny) {
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
  it("requires document.review before listing review work", async () => {
    const harness = createHarness();

    await harness.service.listReviewQueue(context);

    expect(harness.assertions).toEqual([
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

  it("requires document.approve before listing approval work", async () => {
    const harness = createHarness();

    await harness.service.listApprovalQueue(context);

    expect(harness.assertions).toEqual([
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

  it("does not query queue data after authorization denial", async () => {
    const harness = createHarness(true);

    await expect(harness.service.listReviewQueue(context)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    expect(harness.listQueue).not.toHaveBeenCalled();
  });
});
