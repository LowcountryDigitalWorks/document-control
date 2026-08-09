import type { WorkflowInstance, WorkflowState } from "./models";

const allowedTransitions: Readonly<
  Record<WorkflowState, readonly WorkflowState[]>
> = {
  draft: ["review"],
  review: ["approval", "draft"],
  approval: ["approved", "rejected", "draft"],
  approved: [],
  rejected: ["draft"],
};

export function transitionWorkflow(
  instance: WorkflowInstance,
  target: WorkflowState,
): WorkflowInstance {
  if (!allowedTransitions[instance.state].includes(target)) {
    throw new Error(
      `Workflow cannot transition from ${instance.state} to ${target}.`,
    );
  }

  return { ...instance, state: target };
}

export function availableTransitions(
  state: WorkflowState,
): readonly WorkflowState[] {
  return allowedTransitions[state];
}
