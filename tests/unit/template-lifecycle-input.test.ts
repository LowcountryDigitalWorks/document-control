import { describe, expect, it } from "vitest";
import {
  parseTemplateLifecycleInput,
  parseTemplateRevisionInput,
} from "../../src/application/template-lifecycle-input";

describe("template lifecycle administration input", () => {
  it("accepts a bounded template version identifier and lifecycle target", () => {
    expect(
      parseTemplateLifecycleInput(
        new URLSearchParams({
          templateVersionId: "template-version:1",
          targetState: "superseded",
        }),
      ),
    ).toEqual({
      templateVersionId: "template-version:1",
      targetState: "superseded",
    });
  });

  it("rejects missing, malformed, and unknown lifecycle input", () => {
    expect(() => parseTemplateLifecycleInput(new URLSearchParams())).toThrow(
      "Template version is required.",
    );
    expect(() =>
      parseTemplateLifecycleInput(
        new URLSearchParams({
          templateVersionId: "template version <script>",
          targetState: "review",
        }),
      ),
    ).toThrow("Template version identifier is invalid.");
    expect(() =>
      parseTemplateLifecycleInput(
        new URLSearchParams({
          templateVersionId: "template-version-1",
          targetState: "deleted",
        }),
      ),
    ).toThrow("Template lifecycle target is invalid.");
  });

  it("accepts an exact source version only with a bounded revision note and unchanged-content confirmation", () => {
    expect(
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: "template-version:1",
          revisionNote: "Annual unchanged-content reissue",
          confirmUnchangedContent: "confirmed",
        }),
      ),
    ).toEqual({
      sourceTemplateVersionId: "template-version:1",
      revisionNote: "Annual unchanged-content reissue",
    });
  });

  it("rejects invalid or unconfirmed template revision input", () => {
    expect(() => parseTemplateRevisionInput(new URLSearchParams())).toThrow(
      "Source template version is required.",
    );
    expect(() =>
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: "template-version-1",
          revisionNote: "ok",
          confirmUnchangedContent: "confirmed",
        }),
      ),
    ).toThrow("Revision note must be between 3 and 500 characters.");
    expect(() =>
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: "template-version-1",
          revisionNote: "Annual reissue",
        }),
      ),
    ).toThrow(
      "Confirm that this draft revision reuses the exact existing content identity.",
    );
  });
});
