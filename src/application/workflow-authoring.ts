import type { WorkflowTransition } from "../domain/models";

export interface WorkflowGraphSummary {
  initialState: string;
  reachableStateCount: number;
  totalStateCount: number;
  terminalStates: readonly string[];
  branchingStates: readonly string[];
  hasCycle: boolean;
}

export function analyzeWorkflowGraph(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): WorkflowGraphSummary {
  const initialState = states[0] ?? "";
  const outgoing = buildOutgoing(states, transitions);
  const reachable = reachableStates(initialState, outgoing);
  const terminalStates = states.filter(
    (state) => (outgoing.get(state)?.size ?? 0) === 0,
  );
  const branchingStates = states.filter(
    (state) => (outgoing.get(state)?.size ?? 0) > 1,
  );

  return {
    initialState,
    reachableStateCount: reachable.size,
    totalStateCount: states.length,
    terminalStates,
    branchingStates,
    hasCycle: containsCycle(states, outgoing),
  };
}

export function unreachableWorkflowStates(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): readonly string[] {
  const initialState = states[0] ?? "";
  const reachable = reachableStates(
    initialState,
    buildOutgoing(states, transitions),
  );
  return states.filter((state) => !reachable.has(state));
}

function buildOutgoing(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): Map<string, Set<string>> {
  const outgoing = new Map<string, Set<string>>(
    states.map((state) => [state, new Set<string>()]),
  );
  for (const transition of transitions) {
    outgoing.get(transition.from)?.add(transition.to);
  }
  return outgoing;
}

function reachableStates(
  initialState: string,
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const reachable = new Set<string>();
  if (!initialState || !outgoing.has(initialState)) return reachable;
  const pending = [initialState];
  while (pending.length > 0) {
    const state = pending.pop();
    if (!state || reachable.has(state)) continue;
    reachable.add(state);
    for (const target of outgoing.get(state) ?? []) {
      if (!reachable.has(target)) pending.push(target);
    }
  }
  return reachable;
}

function containsCycle(
  states: readonly string[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (state: string): boolean => {
    if (visiting.has(state)) return true;
    if (visited.has(state)) return false;
    visiting.add(state);
    for (const target of outgoing.get(state) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(state);
    visited.add(state);
    return false;
  };

  return states.some((state) => visit(state));
}
