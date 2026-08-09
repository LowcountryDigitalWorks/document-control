import { describe, expect, it } from "vitest";
import {
  approvalAppliesToVersion,
  approveExactVersion,
} from "../../src/domain/approval";
import {
  syntheticApproval,
  syntheticVersionOne,
  syntheticVersionTwo,
  syntheticWorkflowDefinition,
} from "../../src/demo/fixtures";

describe("exact-version approval invariant", () => {
  it("applies to the approved document version and hash", () => {
    expect(
      approvalAppliesToVersion(syntheticApproval, syntheticVersionOne),
    ).toBe(true);
  });

  it("does not apply to a later document version", () => {
    expect(
      approvalAppliesToVersion(syntheticApproval, syntheticVersionTwo),
    ).toBe(false);
  });

  it("does not apply when bytes change under the same version id", () => {
    expect(
      approvalAppliesToVersion(syntheticApproval, {
        ...syntheticVersionOne,
        contentHash: `sha256:${"f".repeat(64)}`,
      }),
    ).toBe(false);
  });

  it("rejects a non-canonical content hash", () => {
    expect(() =>
      approveExactVersion({
        id: "approval-invalid",
        actorId: "actor-approver",
        approvedAt: "2025-08-23T14:30:00.000Z",
        documentVersion: {
          ...syntheticVersionOne,
          contentHash: "not-a-sha256-hash",
        },
        workflowDefinition: syntheticWorkflowDefinition,
      }),
    ).toThrow(/SHA-256/);
  });
});
