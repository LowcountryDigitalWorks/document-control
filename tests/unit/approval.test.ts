import { describe, expect, it } from "vitest";
import {
  approvalAppliesToVersion,
  approveExactVersion,
} from "../../src/domain/approval";
import {
  syntheticApproval,
  syntheticApprover,
  syntheticVersionOne,
  syntheticVersionTwo,
  syntheticWorkflowDefinition,
  syntheticWorkflowInstance,
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
        actorSubjectId: syntheticApprover.id,
        approvedAt: "2026-08-10T13:00:00.000Z",
        documentVersion: {
          ...syntheticVersionOne,
          contentHash: "not-a-sha256-hash",
        },
        workflowDefinition: syntheticWorkflowDefinition,
        workflowInstance: syntheticWorkflowInstance,
      }),
    ).toThrow(/SHA-256/);
  });

  it("rejects an approval against a different workflow-definition version", () => {
    expect(() =>
      approveExactVersion({
        id: "approval-wrong-workflow",
        actorSubjectId: syntheticApprover.id,
        approvedAt: "2026-08-10T13:00:00.000Z",
        documentVersion: syntheticVersionOne,
        workflowDefinition: {
          ...syntheticWorkflowDefinition,
          version: 2,
        },
        workflowInstance: syntheticWorkflowInstance,
      }),
    ).toThrow(/exact document version/);
  });
});
