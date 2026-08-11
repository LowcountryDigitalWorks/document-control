import { describe, expect, it } from "vitest";
import {
  parseWorkspaceWorkflowSelectionInput,
  WorkspaceWorkflowSelectionInputValidationError,
} from "../../src/application/workspace-workflow-selection-input";

describe("workspace workflow selection input", () => {
  it("parses an exact workflow version and bounded action", () => {
    const values = new URLSearchParams({
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: "2",
      action: "default",
    });
    expect(parseWorkspaceWorkflowSelectionInput(values)).toEqual({
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 2,
      action: "default",
    });
  });

  it.each([
    ["", "1", "enable"],
    ["bad id", "1", "enable"],
    ["workflow", "0", "enable"],
    ["workflow", "1.5", "enable"],
    ["workflow", "1", "delete"],
  ])("rejects malformed selection input", (id, version, action) => {
    expect(() =>
      parseWorkspaceWorkflowSelectionInput(
        new URLSearchParams({
          workflowDefinitionId: id,
          workflowDefinitionVersion: version,
          action,
        }),
      ),
    ).toThrow(WorkspaceWorkflowSelectionInputValidationError);
  });
});
