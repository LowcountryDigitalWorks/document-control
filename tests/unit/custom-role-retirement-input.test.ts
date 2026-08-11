import { describe, expect, it } from "vitest";
import { parseCustomRoleRetirementInput } from "../../src/application/roles-access-input";

describe("custom role retirement input", () => {
  it("accepts a bounded role definition identifier", () => {
    expect(
      parseCustomRoleRetirementInput(
        new URLSearchParams({ roleDefinitionId: "role-custom-records" }),
      ),
    ).toEqual({ roleDefinitionId: "role-custom-records" });
  });

  it("rejects missing or unsafe identifiers", () => {
    expect(() =>
      parseCustomRoleRetirementInput(new URLSearchParams()),
    ).toThrow("Custom role is required.");
    expect(() =>
      parseCustomRoleRetirementInput(
        new URLSearchParams({ roleDefinitionId: "role custom<script>" }),
      ),
    ).toThrow("Custom role identifier contains unsupported characters.");
  });
});
