import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  transitionWorkflow,
} from "../../src/domain/workflow";
import {
  syntheticWorkflowDefinition,
  syntheticWorkflowInstance,
} from "../../src/demo/fixtures";

describe("workflow state machine", () => {
  it("executes transitions from the exact workflow definition", () => {
    const draft = { ...syntheticWorkflowInstance, state: "draft" };
    const review = transitionWorkflow(
      draft,
      "review",
      syntheticWorkflowDefinition,
    );
    const approval = transitionWorkflow(
      review,
      "approval",
      syntheticWorkflowDefinition,
    );
    const approved = transitionWorkflow(
      approval,
      "approved",
      syntheticWorkflowDefinition,
    );

    expect(approved.state).toBe("approved");
    expect(
      availableTransitions(syntheticWorkflowDefinition, "approved"),
    ).toEqual([]);
  });

  it("rejects skipping required states", () => {
    const draft = { ...syntheticWorkflowInstance, state: "draft" };
    expect(() =>
      transitionWorkflow(draft, "approved", syntheticWorkflowDefinition),
    ).toThrow(/cannot transition/);
  });

  it("rejects a later definition version for an existing instance", () => {
    expect(() =>
      transitionWorkflow(syntheticWorkflowInstance, "draft", {
        ...syntheticWorkflowDefinition,
        version: 2,
      }),
    ).toThrow(/exact workflow definition version/);
  });

  it("allows a tenant to define a different valid path", () => {
    const custom = {
      ...syntheticWorkflowDefinition,
      id: "workflow-custom",
      states: ["draft", "peer_review", "published"],
      transitions: [
        { from: "draft", to: "peer_review" },
        { from: "peer_review", to: "published" },
      ],
    };
    const instance = {
      ...syntheticWorkflowInstance,
      workflowDefinitionId: custom.id,
      state: "draft",
    };

    expect(transitionWorkflow(instance, "peer_review", custom).state).toBe(
      "peer_review",
    );
  });
});
