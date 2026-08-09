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
});
