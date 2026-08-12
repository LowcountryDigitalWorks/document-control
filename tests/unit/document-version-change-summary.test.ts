import { describe, expect, it } from "vitest";
import {
  DocumentVersionChangeSummaryValidationError,
  normalizeDocumentVersionChangeSummary,
} from "../../src/application/document-version-change-summary";

describe("document version change summary", () => {
  it("trims and accepts bounded plain text", () => {
    expect(
      normalizeDocumentVersionChangeSummary("  Updated opening sequence.  "),
    ).toBe("Updated opening sequence.");
  });

  it("rejects too-short, oversized, and control-character values", () => {
    expect(() => normalizeDocumentVersionChangeSummary("x")).toThrow(
      DocumentVersionChangeSummaryValidationError,
    );
    expect(() =>
      normalizeDocumentVersionChangeSummary("x".repeat(501)),
    ).toThrow(DocumentVersionChangeSummaryValidationError);
    expect(() => normalizeDocumentVersionChangeSummary("bad\nsummary")).toThrow(
      /control characters/,
    );
  });
});
