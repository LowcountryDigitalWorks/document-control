import { describe, expect, it } from "vitest";
import {
  availableWorkflowLifecycleTransitions,
  transitionWorkflowLifecycle,
} from "../../src/domain/workflow-lifecycle";

describe("workflow lifecycle", () => {
  it("supports staged deprecation, reactivation, and terminal retirement", () => {
    expect(availableWorkflowLifecycleTransitions("active")).toEqual([
      "deprecated",
    ]);
    expect(availableWorkflowLifecycleTransitions("deprecated")).toEqual([
      "active",
      "retired",
    ]);
    expect(availableWorkflowLifecycleTransitions("retired")).toEqual([]);

    expect(transitionWorkflowLifecycle("active", "deprecated")).toBe(
      "deprecated",
    );
    expect(transitionWorkflowLifecycle("deprecated", "active")).toBe("active");
    expect(transitionWorkflowLifecycle("deprecated", "retired")).toBe(
      "retired",
    );
  });

  it("rejects retirement without deprecation and reactivation after retirement", () => {
    expect(() => transitionWorkflowLifecycle("active", "retired")).toThrow(
      /cannot transition from active to retired/u,
    );
    expect(() => transitionWorkflowLifecycle("retired", "active")).toThrow(
      /cannot transition from retired to active/u,
    );
  });
});
