export class DocumentVersionChangeSummaryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DocumentVersionChangeSummaryValidationError";
  }
}

export function normalizeDocumentVersionChangeSummary(value: string): string {
  const summary = value.trim();
  if (summary.length < 3 || summary.length > 500) {
    throw new DocumentVersionChangeSummaryValidationError(
      "Document version change summary must be between 3 and 500 characters.",
    );
  }
  for (const character of summary) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) {
      throw new DocumentVersionChangeSummaryValidationError(
        "Document version change summary cannot contain control characters.",
      );
    }
  }
  return summary;
}
