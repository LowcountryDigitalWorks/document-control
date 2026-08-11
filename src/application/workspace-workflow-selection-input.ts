export type WorkspaceWorkflowSelectionAction = "enable" | "disable" | "default";

export interface WorkspaceWorkflowSelectionInput {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  action: WorkspaceWorkflowSelectionAction;
}

export class WorkspaceWorkflowSelectionInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkspaceWorkflowSelectionInputValidationError";
  }
}

const identifierPattern = /^[A-Za-z0-9._:-]+$/u;

export function parseWorkspaceWorkflowSelectionInput(
  values: URLSearchParams,
): WorkspaceWorkflowSelectionInput {
  const workflowDefinitionId = (
    values.get("workflowDefinitionId") ?? ""
  ).trim();
  if (
    !workflowDefinitionId ||
    workflowDefinitionId.length > 256 ||
    !identifierPattern.test(workflowDefinitionId)
  ) {
    throw new WorkspaceWorkflowSelectionInputValidationError(
      "Workflow definition identifier is invalid.",
    );
  }

  const serializedVersion = (
    values.get("workflowDefinitionVersion") ?? ""
  ).trim();
  if (!/^\d{1,9}$/u.test(serializedVersion)) {
    throw new WorkspaceWorkflowSelectionInputValidationError(
      "Workflow definition version is invalid.",
    );
  }
  const workflowDefinitionVersion = Number(serializedVersion);
  if (
    !Number.isSafeInteger(workflowDefinitionVersion) ||
    workflowDefinitionVersion < 1
  ) {
    throw new WorkspaceWorkflowSelectionInputValidationError(
      "Workflow definition version is invalid.",
    );
  }

  const action = (values.get("action") ?? "").trim();
  if (action !== "enable" && action !== "disable" && action !== "default") {
    throw new WorkspaceWorkflowSelectionInputValidationError(
      "Workflow selection action is invalid.",
    );
  }

  return { workflowDefinitionId, workflowDefinitionVersion, action };
}
