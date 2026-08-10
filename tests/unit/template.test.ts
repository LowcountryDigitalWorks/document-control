import { describe, expect, it } from "vitest";
import {
  availableTemplateTransitions,
  transitionTemplateVersion,
} from "../../src/domain/template";
import { syntheticTemplateVersion } from "../../src/demo/fixtures";

describe("controlled template lifecycle", () => {
  it("supports draft through publication without mutating source evidence", () => {
    const draft = {
      ...syntheticTemplateVersion,
      lifecycleState: "draft" as const,
      publishedAt: undefined,
    };
    const review = transitionTemplateVersion(
      draft,
      "review",
      "2026-08-10T12:05:00.000Z",
    );
    const approved = transitionTemplateVersion(
      review,
      "approved",
      "2026-08-10T12:10:00.000Z",
    );
    const published = transitionTemplateVersion(
      approved,
      "published",
      "2026-08-10T12:15:00.000Z",
    );

    expect(published.lifecycleState).toBe("published");
    expect(published.contentHash).toBe(draft.contentHash);
    expect(published.provenance).toBe(draft.provenance);
    expect(published.publishedAt).toBe("2026-08-10T12:15:00.000Z");
  });

  it("does not allow a published version to return to draft", () => {
    expect(() =>
      transitionTemplateVersion(
        syntheticTemplateVersion,
        "draft",
        "2026-08-10T13:00:00.000Z",
      ),
    ).toThrow(/cannot transition/);
    expect(availableTemplateTransitions("published")).toEqual([
      "superseded",
      "retired",
    ]);
  });
});
