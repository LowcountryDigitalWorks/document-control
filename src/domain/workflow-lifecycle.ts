export type WorkflowLifecycleState = "active" | "legacy" | "retired";

const allowedWorkflowLifecycleTransitions: Readonly<
  Record<WorkflowLifecycleState, readonly WorkflowLifecycleState[]>
> = {
  active: ["legacy"],
  legacy: ["active", "retired"],
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
