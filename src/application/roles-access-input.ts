import { customWorkspaceRolePermissions } from "./roles-access-admin-service";

export class RolesAccessInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RolesAccessInputValidationError";
  }
}

const maximumIdentifierLength = 256;

export function parseRoleAssignmentInput(values: URLSearchParams): {
  subjectId: string;
  roleDefinitionId: string;
} {
  return {
    subjectId: requiredIdentifier(values, "subjectId", "Member"),
    roleDefinitionId: requiredIdentifier(values, "roleDefinitionId", "Role"),
  };
}

export function parseRoleRemovalInput(values: URLSearchParams): {
  bindingId: string;
} {
  return {
    bindingId: requiredIdentifier(values, "bindingId", "Role assignment"),
  };
}

export function parseCustomRoleCreateInput(values: URLSearchParams): {
  name: string;
  permissions: readonly string[];
} {
  return {
    name: requiredRoleName(values),
    permissions: requiredCustomPermissions(values),
  };
}

export function parseCustomRoleUpdateInput(values: URLSearchParams): {
  roleDefinitionId: string;
  name: string;
  permissions: readonly string[];
  acknowledgeAssignments: boolean;
} {
  return {
    roleDefinitionId: requiredIdentifier(
      values,
      "roleDefinitionId",
      "Custom role",
    ),
    name: requiredRoleName(values),
    permissions: requiredCustomPermissions(values),
    acknowledgeAssignments: values.get("acknowledgeAssignments") === "yes",
  };
}

function requiredRoleName(values: URLSearchParams): string {
  const name = (values.get("name") ?? "").trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 80) {
    throw new RolesAccessInputValidationError(
      "Custom role name must contain 2 to 80 characters.",
    );
  }
  if (/\p{C}/u.test(name)) {
    throw new RolesAccessInputValidationError(
      "Custom role name contains unsupported control characters.",
    );
  }
  return name;
}

function requiredCustomPermissions(values: URLSearchParams): readonly string[] {
  const selected = [...new Set(values.getAll("permission"))];
  if (selected.length === 0) {
    throw new RolesAccessInputValidationError(
      "Select at least one permission for a custom role.",
    );
  }
  for (const permission of selected) {
    if (
      !customWorkspaceRolePermissions.includes(
        permission as (typeof customWorkspaceRolePermissions)[number],
      )
    ) {
      throw new RolesAccessInputValidationError(
        "One or more selected permissions are not available to custom workspace roles.",
      );
    }
  }
  return customWorkspaceRolePermissions.filter((permission) =>
    selected.includes(permission),
  );
}

function requiredIdentifier(
  values: URLSearchParams,
  key: string,
  label: string,
): string {
  const value = (values.get(key) ?? "").trim();
  if (!value) {
    throw new RolesAccessInputValidationError(`${label} is required.`);
  }
  if (value.length > maximumIdentifierLength) {
    throw new RolesAccessInputValidationError(
      `${label} identifier is too long.`,
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new RolesAccessInputValidationError(
      `${label} identifier contains unsupported characters.`,
    );
  }
  return value;
}
