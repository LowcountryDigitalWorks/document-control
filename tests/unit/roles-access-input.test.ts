import { describe, expect, it } from "vitest";
import {
  parseRoleAssignmentInput,
  parseRoleRemovalInput,
} from "../../src/application/roles-access-input";

describe("roles and access input", () => {
  it("accepts bounded application identifiers", () => {
    expect(
      parseRoleAssignmentInput(
        new URLSearchParams({
          subjectId: "demo-subject_1",
          roleDefinitionId: "role-viewer",
        }),
      ),
    ).toEqual({
      subjectId: "demo-subject_1",
      roleDefinitionId: "role-viewer",
    });
    expect(
      parseRoleRemovalInput(
        new URLSearchParams({ bindingId: "binding:viewer.1" }),
      ),
    ).toEqual({ bindingId: "binding:viewer.1" });
  });

  it("rejects missing, oversized, and unsupported identifiers", () => {
    expect(() => parseRoleRemovalInput(new URLSearchParams())).toThrow(
      "Role assignment is required.",
    );
    expect(() =>
      parseRoleAssignmentInput(
        new URLSearchParams({
          subjectId: "x".repeat(257),
          roleDefinitionId: "role-viewer",
        }),
      ),
    ).toThrow("Member identifier is too long.");
    expect(() =>
      parseRoleAssignmentInput(
        new URLSearchParams({
          subjectId: "member 1<script>",
          roleDefinitionId: "role-viewer",
        }),
      ),
    ).toThrow("Member identifier contains unsupported characters.");
  });
});
