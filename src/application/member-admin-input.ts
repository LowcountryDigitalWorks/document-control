import type { TenantMembershipStatus } from "./member-admin-service";

export class MemberAdminInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MemberAdminInputValidationError";
  }
}

export function parseDirectMemberInput(values: URLSearchParams): {
  displayName: string;
  email: string;
  initialStatus: "active" | "invited";
} {
  const displayName = normalizeDisplayName(values.get("displayName") ?? "");
  const email = normalizeEmail(values.get("email") ?? "");
  const initialStatus = (values.get("initialStatus") ?? "").trim();
  if (initialStatus !== "active" && initialStatus !== "invited") {
    throw new MemberAdminInputValidationError(
      "Initial membership status must be staged or active.",
    );
  }
  return { displayName, email, initialStatus };
}

export function parseMembershipTransitionInput(values: URLSearchParams): {
  membershipId: string;
  targetStatus: "active" | "suspended";
} {
  const membershipId = requiredIdentifier(values.get("membershipId") ?? "");
  const targetStatus = (values.get("targetStatus") ?? "").trim();
  if (targetStatus !== "active" && targetStatus !== "suspended") {
    throw new MemberAdminInputValidationError(
      "Membership target status must be active or suspended.",
    );
  }
  return { membershipId, targetStatus };
}

export function membershipStatusLabel(status: TenantMembershipStatus): string {
  if (status === "invited") return "Staged";
  return `${status[0]?.toUpperCase()}${status.slice(1)}`;
}

function normalizeDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 100) {
    throw new MemberAdminInputValidationError(
      "Member display name must contain 2 to 100 characters.",
    );
  }
  if (/\p{C}/u.test(name)) {
    throw new MemberAdminInputValidationError(
      "Member display name contains unsupported control characters.",
    );
  }
  return name;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new MemberAdminInputValidationError(
      "A valid member email address is required.",
    );
  }
  return email;
}

function requiredIdentifier(value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/u.test(normalized)
  ) {
    throw new MemberAdminInputValidationError(
      "Membership identifier is invalid.",
    );
  }
  return normalized;
}
