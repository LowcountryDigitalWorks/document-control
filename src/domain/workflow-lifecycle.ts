export type WorkflowLifecycleState = "active" | "deprecated" | "retired";

const allowedWorkflowLifecycleTransitions: Readonly<
  Record<WorkflowLifecycleState, readonly WorkflowLifecycleState[]>
> = {
  active: ["deprecated"],
  deprecated: ["active", "retired"],
  retired: [],
};

export function transitionWorkflowLifecycle(
  current: WorkflowLifecycleState,
  target: WorkflowLifecycleState,
): WorkflowLifecycleState {
  if (!allowedWorkflowLifecycleTransitions[current].includes(target)) {
    throw new Error(
      `Workflow version cannot transition from ${current} to ${target}.`,
    );
  }
  return target;
}

export function availableWorkflowLifecycleTransitions(
  state: WorkflowLifecycleState,
): readonly WorkflowLifecycleState[] {
  return allowedWorkflowLifecycleTransitions[state];
}
