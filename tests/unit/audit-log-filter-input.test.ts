import { describe, expect, it } from "vitest";
import {
  AuditLogFilterValidationError,
  parseAuditLogFilters,
} from "../../src/application/audit-log-filter-input";

describe("audit log filter input", () => {
  it("trims a supported search value", () => {
    expect(
      parseAuditLogFilters(new URLSearchParams({ q: "  approval  " })),
    ).toEqual({ query: "approval" });
  });

  it("omits blank search text", () => {
    expect(parseAuditLogFilters(new URLSearchParams({ q: "   " }))).toEqual(
      {},
    );
  });

  it("rejects search text over the fixed bound", () => {
    expect(() =>
      parseAuditLogFilters(new URLSearchParams({ q: "x".repeat(101) })),
    ).toThrow(AuditLogFilterValidationError);
  });
});
