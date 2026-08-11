import { describe, expect, it } from "vitest";
import {
  parseWorkflowLifecycleInput,
  WorkflowLifecycleInputValidationError,
} from "../../src/application/workflow-lifecycle-input";

describe("parseWorkflowLifecycleInput", () => {
  it("accepts an exact workflow version and lifecycle target", () => {
    expect(
      parseWorkflowLifecycleInput(
        new URLSearchParams({
          workflowDefinitionId: "workflow-standard",
          workflowDefinitionVersion: "2",
          targetState: "deprecated",
        }),
      ),
    ).toEqual({
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 2,
      targetState: "deprecated",
    });
  });

  it("rejects malformed identifiers, versions, and lifecycle targets", () => {
    for (const values of [
      {
        workflowDefinitionId: "bad id",
        workflowDefinitionVersion: "1",
        targetState: "deprecated",
      },
      {
        workflowDefinitionId: "workflow-standard",
        workflowDefinitionVersion: "0",
        targetState: "deprecated",
      },
      {
        workflowDefinitionId: "workflow-standard",
        workflowDefinitionVersion: "1",
        targetState: "deleted",
      },
    ]) {
      expect(() =>
        parseWorkflowLifecycleInput(new URLSearchParams(values)),
      ).toThrow(WorkflowLifecycleInputValidationError);
    }
  });
});
