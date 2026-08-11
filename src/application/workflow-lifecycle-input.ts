import type { WorkflowLifecycleState } from "../domain/workflow-lifecycle";

export class WorkflowLifecycleInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkflowLifecycleInputValidationError";
  }
}

const lifecycleStates: readonly WorkflowLifecycleState[] = [
  "active",
  "deprecated",
  "retired",
];

export function parseWorkflowLifecycleInput(values: URLSearchParams): {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  targetState: WorkflowLifecycleState;
} {
  const workflowDefinitionId = (
    values.get("workflowDefinitionId") ?? ""
  ).trim();
  if (
    !workflowDefinitionId ||
    workflowDefinitionId.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/u.test(workflowDefinitionId)
  ) {
    throw new WorkflowLifecycleInputValidationError(
      "Workflow definition identifier is invalid.",
    );
  }

  const versionText = (values.get("workflowDefinitionVersion") ?? "").trim();
  if (!/^[1-9][0-9]{0,8}$/u.test(versionText)) {
    throw new WorkflowLifecycleInputValidationError(
      "Workflow definition version must be a positive integer.",
    );
  }
  const workflowDefinitionVersion = Number(versionText);

  const target = (values.get("targetState") ?? "").trim();
  if (!lifecycleStates.includes(target as WorkflowLifecycleState)) {
    throw new WorkflowLifecycleInputValidationError(
      "Workflow lifecycle target is invalid.",
    );
  }

  return {
    workflowDefinitionId,
    workflowDefinitionVersion,
    targetState: target as WorkflowLifecycleState,
  };
}
