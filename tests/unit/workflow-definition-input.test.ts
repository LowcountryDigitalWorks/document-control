import { describe, expect, it } from "vitest";
import {
  parseExistingWorkflowId,
  parseWorkflowDefinitionInput,
} from "../../src/application/workflow-definition-input";

describe("workflow definition administration input", () => {
  it("parses bounded states and transitions", () => {
    expect(
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Document Approval",
          states: "draft\nreview\napproval\napproved",
          transitions:
            "draft -> review\nreview -> draft\nreview -> approval\napproval -> approved",
        }),
      ),
    ).toEqual({
      name: "Document Approval",
      states: ["draft", "review", "approval", "approved"],
      transitions: [
        { from: "draft", to: "review" },
        { from: "review", to: "draft" },
        { from: "review", to: "approval" },
        { from: "approval", to: "approved" },
      ],
    });
  });

  it("rejects duplicate or malformed state-machine input", () => {
    expect(() =>
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Workflow",
          states: "draft\ndraft",
          transitions: "",
        }),
      ),
    ).toThrow("Workflow state identifiers must be unique.");

    expect(() =>
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Workflow",
          states: "draft\napproved",
          transitions: "draft => approved",
        }),
      ),
    ).toThrow("must use the format from_state -> to_state");

    expect(() =>
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Workflow",
          states: "draft\napproved",
          transitions: "draft -> review",
        }),
      ),
    ).toThrow("references a state that is not defined");
  });

  it("validates an existing workflow family identifier", () => {
    expect(
      parseExistingWorkflowId(
        new URLSearchParams({ workflowDefinitionId: "workflow:approval-1" }),
      ),
    ).toBe("workflow:approval-1");
    expect(() => parseExistingWorkflowId(new URLSearchParams())).toThrow(
      "Existing workflow definition is required.",
    );
    expect(() =>
      parseExistingWorkflowId(
        new URLSearchParams({ workflowDefinitionId: "workflow <script>" }),
      ),
    ).toThrow("identifier is invalid");
  });
});
