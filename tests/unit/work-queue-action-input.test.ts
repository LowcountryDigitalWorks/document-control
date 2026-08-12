import { describe, expect, it } from "vitest";
import {
  parseApprovalQueueActionInput,
  parseReviewQueueActionInput,
} from "../../src/application/work-queue-action-input";

describe("work queue action input", () => {
  it("normalizes an accepted review with an optional comment", () => {
    expect(
      parseReviewQueueActionInput(
        new URLSearchParams({
          decision: "accepted",
          comment: "  Evidence reviewed.  ",
        }),
      ),
    ).toEqual({ decision: "accepted", comment: "Evidence reviewed." });
  });

  it("requires a meaningful comment when requesting changes", () => {
    expect(() =>
      parseReviewQueueActionInput(
        new URLSearchParams({ decision: "changes_requested", comment: "  " }),
      ),
    ).toThrow(/requires a short review comment/u);
  });

  it("rejects unsupported decisions and oversized comments", () => {
    expect(() =>
      parseReviewQueueActionInput(
        new URLSearchParams({ decision: "commented", comment: "Note" }),
      ),
    ).toThrow(/Choose Accept or Request changes/u);
    expect(() =>
      parseReviewQueueActionInput(
        new URLSearchParams({
          decision: "accepted",
          comment: "x".repeat(501),
        }),
      ),
    ).toThrow(/500 characters or fewer/u);
  });

  it("requires explicit exact-version approval confirmation", () => {
    expect(
      parseApprovalQueueActionInput(
        new URLSearchParams({ confirmApproval: "yes" }),
      ),
    ).toEqual({
      confirmed: true,
    });
    expect(() => parseApprovalQueueActionInput(new URLSearchParams())).toThrow(
      /Confirm exact-version approval/u,
    );
  });
});
