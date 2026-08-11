import { describe, expect, it } from "vitest";
import { parseTemplateLifecycleInput } from "../../src/application/template-lifecycle-input";

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
});
