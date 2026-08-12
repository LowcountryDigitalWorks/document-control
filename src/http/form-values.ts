import { DocumentRetirementInputValidationError } from "../application/document-retirement-input";
import { MemberAdminInputValidationError } from "../application/member-admin-input";
import { RolesAccessInputValidationError } from "../application/roles-access-input";
import { TemplateLifecycleInputValidationError } from "../application/template-lifecycle-input";
import { WorkQueueActionInputValidationError } from "../application/work-queue-action-input";
import { WorkflowDefinitionInputValidationError } from "../application/workflow-definition-input";
import { WorkflowLifecycleInputValidationError } from "../application/workflow-lifecycle-input";
import { WorkspaceWorkflowSelectionInputValidationError } from "../application/workspace-workflow-selection-input";

export async function readRolesAccessFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    keys,
    () => new RolesAccessInputValidationError("A valid form body is required."),
  );
}

export async function readWorkQueueActionFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    keys,
    () =>
      new WorkQueueActionInputValidationError(
        "A valid work queue form body is required.",
      ),
  );
}

export async function readDocumentRetirementFormValues(
  request: Request,
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new DocumentRetirementInputValidationError(
      "A valid form body is required.",
    );
  }
  const values = new URLSearchParams();
  const confirmation = formData.get("confirmRetirement");
  if (typeof confirmation === "string") {
    values.set("confirmRetirement", confirmation);
  }
  return values;
}

export async function readMemberFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    keys,
    () => new MemberAdminInputValidationError("A valid form body is required."),
  );
}

export async function readRoleDefinitionFormValues(
  request: Request,
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new RolesAccessInputValidationError("A valid form body is required.");
  }
  const values = new URLSearchParams();
  for (const key of ["roleDefinitionId", "name", "acknowledgeAssignments"]) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  for (const value of formData.getAll("permission")) {
    if (typeof value === "string") values.append("permission", value);
  }
  return values;
}

export async function readWorkflowFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    keys,
    () =>
      new WorkflowDefinitionInputValidationError(
        "A valid form body is required.",
      ),
  );
}

export async function readWorkflowLifecycleFormValues(
  request: Request,
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    ["workflowDefinitionId", "workflowDefinitionVersion", "targetState"],
    () =>
      new WorkflowLifecycleInputValidationError(
        "A valid form body is required.",
      ),
  );
}

export async function readWorkflowSelectionFormValues(
  request: Request,
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    ["workflowDefinitionId", "workflowDefinitionVersion", "action"],
    () =>
      new WorkspaceWorkflowSelectionInputValidationError(
        "A valid form body is required.",
      ),
  );
}

export async function readTemplateLifecycleFormValues(
  request: Request,
): Promise<URLSearchParams> {
  return readStringFormValues(
    request,
    [
      "templateVersionId",
      "targetState",
      "sourceTemplateVersionId",
      "revisionNote",
      "confirmUnchangedContent",
    ],
    () =>
      new TemplateLifecycleInputValidationError(
        "A valid form body is required.",
      ),
  );
}

async function readStringFormValues(
  request: Request,
  keys: readonly string[],
  createError: () => Error,
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw createError();
  }
  const values = new URLSearchParams();
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}
