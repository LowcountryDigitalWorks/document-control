import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  transitionWorkflow,
} from "../../src/domain/workflow";
import { syntheticWorkflowInstance } from "../../src/demo/fixtures";

describe("workflow state machine", () => {
  it("supports the review and approval path", () => {
    const draft = { ...syntheticWorkflowInstance, state: "draft" as const };
    const review = transitionWorkflow(draft, "review");
    const approval = transitionWorkflow(review, "approval");
    const approved = transitionWorkflow(approval, "approved");

    expect(approved.state).toBe("approved");
    expect(availableTransitions("approved")).toEqual([]);
  });

  it("rejects skipping required states", () => {
    const draft = { ...syntheticWorkflowInstance, state: "draft" as const };
    expect(() => transitionWorkflow(draft, "approved")).toThrow(
      /cannot transition/,
    );
  });
});
