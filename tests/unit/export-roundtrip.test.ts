import { describe, expect, it } from "vitest";
import { parseExport, serializeExport } from "../../src/application/export";
import { createSyntheticExport } from "../../src/demo/fixtures";

describe("portable export", () => {
  it("round-trips all synthetic application records", () => {
    const source = createSyntheticExport();
    expect(parseExport(serializeExport(source))).toEqual(source);
  });

  it("rejects unknown export versions", () => {
    const source = createSyntheticExport();
    expect(() =>
      parseExport(JSON.stringify({ ...source, version: 2 })),
    ).toThrow(/Unsupported/);
  });

  it("rejects cross-tenant records", () => {
    const source = createSyntheticExport();
    const tampered = {
      ...source,
      workspaces: [{ ...source.workspaces[0], tenantId: "tenant-other" }],
    };

    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /tenant boundary/,
    );
  });

  it("rejects approvals whose hash no longer matches the document version", () => {
    const source = createSyntheticExport();
    const tampered = {
      ...source,
      approvals: [
        {
          ...source.approvals[0],
          contentHash: `sha256:${"f".repeat(64)}`,
        },
      ],
    };

    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /exact evidence/,
    );
  });

  it("rejects incomplete top-level structures instead of casting them", () => {
    const source = createSyntheticExport();
    const { reviews: _reviews, ...withoutReviews } = source;

    expect(() => parseExport(JSON.stringify(withoutReviews))).toThrow(
      /reviews must be an array/,
    );
  });
});
