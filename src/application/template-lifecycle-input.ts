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

export function parseTemplateRevisionInput(values: URLSearchParams): {
  sourceTemplateVersionId: string;
  revisionNote: string;
} {
  const sourceTemplateVersionId = (
    values.get("sourceTemplateVersionId") ?? ""
  ).trim();
  assertTemplateVersionIdentifier(
    sourceTemplateVersionId,
    "Source template version",
  );

  const revisionNote = (values.get("revisionNote") ?? "").trim();
  if (revisionNote.length < 3 || revisionNote.length > 500) {
    throw new TemplateLifecycleInputValidationError(
      "Revision note must be between 3 and 500 characters.",
    );
  }

  if (values.get("confirmUnchangedContent") !== "confirmed") {
    throw new TemplateLifecycleInputValidationError(
      "Confirm that this draft revision reuses the exact existing content identity.",
    );
  }

  return { sourceTemplateVersionId, revisionNote };
}

export function parseTemplateLifecycleInput(values: URLSearchParams): {
  templateVersionId: string;
  targetState: TemplateLifecycleState;
} {
  const templateVersionId = (values.get("templateVersionId") ?? "").trim();
  assertTemplateVersionIdentifier(templateVersionId, "Template version");

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

function assertTemplateVersionIdentifier(value: string, label: string): void {
  if (!value) {
    throw new TemplateLifecycleInputValidationError(`${label} is required.`);
  }
  if (value.length > 256 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new TemplateLifecycleInputValidationError(
      `${label} identifier is invalid.`,
    );
  }
}
