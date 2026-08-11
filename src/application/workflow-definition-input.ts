import type { WorkflowTransition } from "../domain/models";
import { unreachableWorkflowStates } from "./workflow-authoring";

export interface WorkflowDefinitionInput {
  name: string;
  states: readonly string[];
  transitions: readonly WorkflowTransition[];
}

export type WorkflowAuthoringMode = "create" | "version";

export interface WorkflowSourceQuery {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
}

export class WorkflowDefinitionInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkflowDefinitionInputValidationError";
  }
}

const maximumNameLength = 100;
const maximumStateCount = 20;
const maximumStateLength = 40;
const maximumTransitionCount = 50;
const maximumWorkflowVersion = 1_000_000;
const statePattern = /^[a-z][a-z0-9_-]*$/u;

export function parseWorkflowDefinitionInput(
  values: URLSearchParams,
): WorkflowDefinitionInput {
  const name = requiredText(
    values.get("name"),
    "Workflow name",
    maximumNameLength,
  );
  const states = parseStates(values.get("states") ?? "");
  const transitions = parseTransitions(values.get("transitions") ?? "", states);
  const unreachable = unreachableWorkflowStates(states, transitions);
  if (unreachable.length > 0) {
    throw new WorkflowDefinitionInputValidationError(
      `Every workflow state must be reachable from the initial state "${states[0]}". Unreachable: ${unreachable.join(", ")}.`,
    );
  }
  return { name, states, transitions };
}

export function parseWorkflowAuthoringMode(
  values: URLSearchParams,
): WorkflowAuthoringMode {
  const value = (values.get("mode") ?? "").trim();
  if (value !== "create" && value !== "version") {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow authoring mode is invalid.",
    );
  }
  return value;
}

export function parseWorkflowSourceQuery(
  values: URLSearchParams,
): WorkflowSourceQuery | undefined {
  const rawId = (values.get("sourceId") ?? "").trim();
  const rawVersion = (values.get("sourceVersion") ?? "").trim();
  if (!rawId && !rawVersion) return undefined;
  if (!rawId || !rawVersion) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow source requires both an identifier and exact version.",
    );
  }
  return {
    workflowDefinitionId: validateWorkflowId(rawId),
    workflowDefinitionVersion: parseWorkflowVersion(rawVersion),
  };
}

export function parseOptionalWorkflowSourceVersion(
  values: URLSearchParams,
): number | undefined {
  const rawVersion = (values.get("sourceVersion") ?? "").trim();
  return rawVersion ? parseWorkflowVersion(rawVersion) : undefined;
}

export function parseExistingWorkflowId(values: URLSearchParams): string {
  const value = (values.get("workflowDefinitionId") ?? "").trim();
  if (!value) {
    throw new WorkflowDefinitionInputValidationError(
      "Existing workflow definition is required.",
    );
  }
  return validateWorkflowId(value);
}

function validateWorkflowId(value: string): string {
  if (value.length > 256 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new WorkflowDefinitionInputValidationError(
      "Existing workflow definition identifier is invalid.",
    );
  }
  return value;
}

function parseWorkflowVersion(value: string): number {
  const version = Number(value);
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > maximumWorkflowVersion
  ) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow source version is invalid.",
    );
  }
  return version;
}

function parseStates(serialized: string): readonly string[] {
  const states = serialized
    .split(/\r?\n/u)
    .map((state) => state.trim())
    .filter(Boolean);
  if (states.length === 0) {
    throw new WorkflowDefinitionInputValidationError(
      "At least one workflow state is required.",
    );
  }
  if (states.length > maximumStateCount) {
    throw new WorkflowDefinitionInputValidationError(
      `Workflow definitions may contain at most ${maximumStateCount} states.`,
    );
  }
  if (new Set(states).size !== states.length) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow state identifiers must be unique.",
    );
  }
  for (const state of states) {
    if (state.length > maximumStateLength || !statePattern.test(state)) {
      throw new WorkflowDefinitionInputValidationError(
        `Workflow state "${state}" must be ${maximumStateLength} characters or fewer and use lowercase letters, numbers, underscores, or hyphens, beginning with a letter.`,
      );
    }
  }
  return states;
}

function parseTransitions(
  serialized: string,
  states: readonly string[],
): readonly WorkflowTransition[] {
  const lines = serialized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > maximumTransitionCount) {
    throw new WorkflowDefinitionInputValidationError(
      `Workflow definitions may contain at most ${maximumTransitionCount} transitions.`,
    );
  }

  const stateSet = new Set(states);
  const seen = new Set<string>();
  return lines.map((line) => {
    const match = /^([a-z][a-z0-9_-]*)\s*->\s*([a-z][a-z0-9_-]*)$/u.exec(line);
    if (!match) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" must use the format from_state -> to_state.`,
      );
    }
    const from = match[1];
    const to = match[2];
    if (!from || !to || !stateSet.has(from) || !stateSet.has(to)) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" references a state that is not defined.`,
      );
    }
    const key = `${from}->${to}`;
    if (seen.has(key)) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" is duplicated.`,
      );
    }
    seen.add(key);
    return { from, to };
  });
}

function requiredText(
  value: string | null,
  label: string,
  maximumLength: number,
): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    throw new WorkflowDefinitionInputValidationError(`${label} is required.`);
  }
  if (normalized.length > maximumLength) {
    throw new WorkflowDefinitionInputValidationError(
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }
  if (
    Array.from(normalized).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new WorkflowDefinitionInputValidationError(
      `${label} cannot contain control characters.`,
    );
  }
  return normalized;
}
