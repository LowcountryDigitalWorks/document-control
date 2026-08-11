import { describe, expect, it } from "vitest";
import {
  parseCustomRoleCreateInput,
  parseCustomRoleUpdateInput,
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

  it("accepts safe custom-role names and repeated permission inputs", () => {
    const createValues = new URLSearchParams();
    createValues.set("name", "  Records   Coordinator  ");
    createValues.append("permission", "audit.read");
    createValues.append("permission", "document.read");
    createValues.append("permission", "audit.read");
    expect(parseCustomRoleCreateInput(createValues)).toEqual({
      name: "Records Coordinator",
      permissions: ["document.read", "audit.read"],
    });

    const updateValues = new URLSearchParams();
    updateValues.set("roleDefinitionId", "role-custom-records");
    updateValues.set("name", "Records Lead");
    updateValues.append("permission", "document.read");
    updateValues.append("permission", "document.review");
    updateValues.set("acknowledgeAssignments", "yes");
    expect(parseCustomRoleUpdateInput(updateValues)).toEqual({
      roleDefinitionId: "role-custom-records",
      name: "Records Lead",
      permissions: ["document.read", "document.review"],
      acknowledgeAssignments: true,
    });
  });

  it("rejects administrative or empty custom-role permission sets", () => {
    expect(() =>
      parseCustomRoleCreateInput(
        new URLSearchParams({ name: "Records Coordinator" }),
      ),
    ).toThrow("Select at least one permission");

    const unsafe = new URLSearchParams({ name: "Unsafe Role" });
    unsafe.append("permission", "document.read");
    unsafe.append("permission", "role.manage");
    expect(() => parseCustomRoleCreateInput(unsafe)).toThrow(
      "not available to custom workspace roles",
    );
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
