import { describe, expect, it } from "vitest";
import {
  parseDocumentFilters,
  parseTemplateFilters,
  WorkspaceFilterValidationError,
} from "../../src/application/workspace-filter-input";

describe("workspace filter input", () => {
  it("normalizes supported document filters", () => {
    expect(
      parseDocumentFilters(
        new URLSearchParams({
          q: "  harbor  ",
          status: "in_review",
          approval: "required",
        }),
      ),
    ).toEqual({
      query: "harbor",
      status: "in_review",
      currentApproval: "required",
    });
  });

  it("normalizes supported template filters", () => {
    expect(
      parseTemplateFilters(
        new URLSearchParams({ q: " procedure ", lifecycle: "published" }),
      ),
    ).toEqual({ query: "procedure", lifecycle: "published" });
  });

  it("omits blank filters", () => {
    expect(parseDocumentFilters(new URLSearchParams({ q: "   " }))).toEqual({});
  });

  it("rejects unknown enumerated values", () => {
    expect(() =>
      parseDocumentFilters(new URLSearchParams({ status: "deleted" })),
    ).toThrow(WorkspaceFilterValidationError);
    expect(() =>
      parseTemplateFilters(new URLSearchParams({ lifecycle: "archived" })),
    ).toThrow(WorkspaceFilterValidationError);
  });

  it("rejects search text over the fixed bound", () => {
    expect(() =>
      parseDocumentFilters(new URLSearchParams({ q: "x".repeat(101) })),
    ).toThrow("Search text must be 100 characters or fewer.");
  });
});
