import { describe, expect, it } from "vitest";
import { analyzeWorkflowGraph } from "../../src/application/workflow-authoring";
import {
  parseOptionalWorkflowSourceVersion,
  parseWorkflowAuthoringMode,
  parseWorkflowDefinitionInput,
  parseWorkflowSourceQuery,
} from "../../src/application/workflow-definition-input";

describe("workflow authoring helpers", () => {
  it("summarizes reachable, terminal, branching, and cyclic graph properties", () => {
    const input = parseWorkflowDefinitionInput(
      new URLSearchParams({
        name: "Approval",
        states: "draft\nreview\napproval\napproved",
        transitions:
          "draft -> review\nreview -> draft\nreview -> approval\napproval -> approved",
      }),
    );
    expect(analyzeWorkflowGraph(input.states, input.transitions)).toEqual({
      initialState: "draft",
      reachableStateCount: 4,
      totalStateCount: 4,
      terminalStates: ["approved"],
      branchingStates: ["review"],
      hasCycle: true,
    });
  });

  it("rejects unreachable states in newly submitted drafts", () => {
    expect(() =>
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Broken graph",
          states: "draft\nreview\napproved\narchive",
          transitions: "draft -> review\nreview -> approved",
        }),
      ),
    ).toThrow(
      'Every workflow state must be reachable from the initial state "draft". Unreachable: archive.',
    );
  });

  it("validates exact source queries and authoring mode", () => {
    expect(
      parseWorkflowSourceQuery(
        new URLSearchParams({
          sourceId: "workflow:approval-1",
          sourceVersion: "3",
        }),
      ),
    ).toEqual({
      workflowDefinitionId: "workflow:approval-1",
      workflowDefinitionVersion: 3,
    });
    expect(parseWorkflowSourceQuery(new URLSearchParams())).toBeUndefined();
    expect(() =>
      parseWorkflowSourceQuery(
        new URLSearchParams({ sourceId: "workflow:one" }),
      ),
    ).toThrow("requires both an identifier and exact version");
    expect(
      parseOptionalWorkflowSourceVersion(
        new URLSearchParams({ sourceVersion: "4" }),
      ),
    ).toBe(4);
    expect(
      parseWorkflowAuthoringMode(new URLSearchParams({ mode: "version" })),
    ).toBe("version");
    expect(() =>
      parseWorkflowAuthoringMode(new URLSearchParams({ mode: "delete" })),
    ).toThrow("authoring mode is invalid");
  });
});
