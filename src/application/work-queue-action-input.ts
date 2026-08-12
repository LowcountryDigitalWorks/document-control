export class WorkQueueActionInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkQueueActionInputValidationError";
  }
}

export type ReviewQueueDecision = "accepted" | "changes_requested";

export interface ReviewQueueActionInput {
  decision: ReviewQueueDecision;
  comment?: string;
}

export interface ApprovalQueueActionInput {
  confirmed: true;
}

export function parseReviewQueueActionInput(
  values: URLSearchParams,
): ReviewQueueActionInput {
  const decision = values.get("decision");
  if (decision !== "accepted" && decision !== "changes_requested") {
    throw new WorkQueueActionInputValidationError(
      "Choose Accept or Request changes for this review item.",
    );
  }

  const rawComment = values.get("comment") ?? "";
  const comment = rawComment.trim();
  if (comment.length > 500) {
    throw new WorkQueueActionInputValidationError(
      "Review comments must be 500 characters or fewer.",
    );
  }
  if (containsDisallowedControlCharacter(comment)) {
    throw new WorkQueueActionInputValidationError(
      "Review comments contain unsupported control characters.",
    );
  }
  if (decision === "changes_requested" && comment.length < 3) {
    throw new WorkQueueActionInputValidationError(
      "Requesting changes requires a short review comment.",
    );
  }

  return {
    decision,
    comment: comment.length > 0 ? comment : undefined,
  };
}

export function parseApprovalQueueActionInput(
  values: URLSearchParams,
): ApprovalQueueActionInput {
  if (values.get("confirmApproval") !== "yes") {
    throw new WorkQueueActionInputValidationError(
      "Confirm exact-version approval before continuing.",
    );
  }
  return { confirmed: true };
}

function containsDisallowedControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }
  return false;
}
