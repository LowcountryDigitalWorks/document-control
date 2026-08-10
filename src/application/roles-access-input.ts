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
