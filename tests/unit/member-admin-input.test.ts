import { describe, expect, it } from "vitest";
import {
  membershipStatusLabel,
  parseDirectMemberInput,
  parseMembershipTransitionInput,
} from "../../src/application/member-admin-input";

describe("tenant member administration input", () => {
  it("normalizes direct-member identity fields and staged status", () => {
    expect(
      parseDirectMemberInput(
        new URLSearchParams({
          displayName: "  Jordan   Smith ",
          email: " JORDAN@example.com ",
          initialStatus: "invited",
        }),
      ),
    ).toEqual({
      displayName: "Jordan Smith",
      email: "jordan@example.com",
      initialStatus: "invited",
    });
  });

  it("accepts active and suspended membership transition targets", () => {
    expect(
      parseMembershipTransitionInput(
        new URLSearchParams({
          membershipId: "membership-local-1",
          targetStatus: "active",
        }),
      ),
    ).toEqual({ membershipId: "membership-local-1", targetStatus: "active" });
    expect(membershipStatusLabel("invited")).toBe("Staged");
    expect(membershipStatusLabel("suspended")).toBe("Suspended");
  });

  it("rejects malformed identity data and unsupported status changes", () => {
    expect(() =>
      parseDirectMemberInput(
        new URLSearchParams({
          displayName: "J",
          email: "not-an-email",
          initialStatus: "active",
        }),
      ),
    ).toThrow(/display name/iu);
    expect(() =>
      parseDirectMemberInput(
        new URLSearchParams({
          displayName: "Jordan Smith",
          email: "not-an-email",
          initialStatus: "active",
        }),
      ),
    ).toThrow(/valid member email/iu);
    expect(() =>
      parseMembershipTransitionInput(
        new URLSearchParams({
          membershipId: "membership-local-1",
          targetStatus: "deleted",
        }),
      ),
    ).toThrow(/active or suspended/iu);
  });
});
