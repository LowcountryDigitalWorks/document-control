export class DocumentRetirementInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DocumentRetirementInputValidationError";
  }
}

export interface DocumentRetirementInput {
  confirmed: true;
}

export function parseDocumentRetirementInput(
  values: URLSearchParams,
): DocumentRetirementInput {
  if (values.get("confirmRetirement") !== "yes") {
    throw new DocumentRetirementInputValidationError(
      "Confirm document retirement before continuing.",
    );
  }
  return { confirmed: true };
}
