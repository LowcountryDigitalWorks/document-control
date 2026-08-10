import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowTransition,
} from "./models";

export function assertValidWorkflowDefinition(
  definition: WorkflowDefinition,
): void {
  if (definition.version < 1) {
    throw new Error("Workflow definition version must be positive.");
  }

  if (definition.states.length === 0) {
    throw new Error("Workflow definition must contain at least one state.");
  }

  const states = new Set(definition.states);
  if (states.size !== definition.states.length) {
    throw new Error("Workflow definition states must be unique.");
  }

  for (const state of states) {
    if (!state.trim()) {
      throw new Error("Workflow state names cannot be empty.");
    }
  }

  for (const transition of definition.transitions) {
    assertTransitionReferencesState(transition, states);
  }
}

export function transitionWorkflow(
  instance: WorkflowInstance,
  target: string,
  definition: WorkflowDefinition,
): WorkflowInstance {
  assertInstanceMatchesDefinition(instance, definition);
  assertValidWorkflowDefinition(definition);

  if (!definition.states.includes(instance.state)) {
    throw new Error(
      `Workflow state ${instance.state} is not part of definition ${definition.id} v${definition.version}.`,
    );
  }

  if (!definition.states.includes(target)) {
    throw new Error(
      `Workflow target ${target} is not part of definition ${definition.id} v${definition.version}.`,
    );
  }

  const allowed = definition.transitions.some(
    (transition) =>
      transition.from === instance.state && transition.to === target,
  );

  if (!allowed) {
    throw new Error(
      `Workflow cannot transition from ${instance.state} to ${target} under definition ${definition.id} v${definition.version}.`,
    );
  }

  return { ...instance, state: target };
}

export function availableTransitions(
  definition: WorkflowDefinition,
  state: string,
): readonly string[] {
  assertValidWorkflowDefinition(definition);
  if (!definition.states.includes(state)) {
    throw new Error(`Workflow state ${state} is not defined.`);
  }

  return definition.transitions
    .filter((transition) => transition.from === state)
    .map((transition) => transition.to);
}

function assertInstanceMatchesDefinition(
  instance: WorkflowInstance,
  definition: WorkflowDefinition,
): void {
  if (
    instance.tenantId !== definition.tenantId ||
    instance.workflowDefinitionId !== definition.id ||
    instance.workflowDefinitionVersion !== definition.version
  ) {
    throw new Error(
      "Workflow instance must execute the exact workflow definition version it was created with.",
    );
  }
}

function assertTransitionReferencesState(
  transition: WorkflowTransition,
  states: ReadonlySet<string>,
): void {
  if (!states.has(transition.from) || !states.has(transition.to)) {
    throw new Error(
      `Workflow transition ${transition.from} -> ${transition.to} references an undefined state.`,
    );
  }
}
