import { describe, expect, it } from "vitest";
import { parseDocumentRetirementInput } from "../../src/application/document-retirement-input";

describe("document retirement input", () => {
  it("requires an explicit retirement confirmation", () => {
    expect(
      parseDocumentRetirementInput(
        new URLSearchParams({ confirmRetirement: "yes" }),
      ),
    ).toEqual({ confirmed: true });

    expect(() => parseDocumentRetirementInput(new URLSearchParams())).toThrow(
      "Confirm document retirement before continuing.",
    );
    expect(() =>
      parseDocumentRetirementInput(
        new URLSearchParams({ confirmRetirement: "no" }),
      ),
    ).toThrow("Confirm document retirement before continuing.");
  });
});
