import type { TemplateLifecycleState } from "../domain/models";

export class TemplateLifecycleInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TemplateLifecycleInputValidationError";
  }
}

const lifecycleStates: readonly TemplateLifecycleState[] = [
  "draft",
  "review",
  "approved",
  "published",
  "superseded",
  "retired",
];

export function parseTemplateLifecycleInput(values: URLSearchParams): {
  templateVersionId: string;
  targetState: TemplateLifecycleState;
} {
  const templateVersionId = (values.get("templateVersionId") ?? "").trim();
  if (!templateVersionId) {
    throw new TemplateLifecycleInputValidationError(
      "Template version is required.",
    );
  }
  if (
    templateVersionId.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/u.test(templateVersionId)
  ) {
    throw new TemplateLifecycleInputValidationError(
      "Template version identifier is invalid.",
    );
  }

  const target = (values.get("targetState") ?? "").trim();
  if (!lifecycleStates.includes(target as TemplateLifecycleState)) {
    throw new TemplateLifecycleInputValidationError(
      "Template lifecycle target is invalid.",
    );
  }
  return {
    templateVersionId,
    targetState: target as TemplateLifecycleState,
  };
}
