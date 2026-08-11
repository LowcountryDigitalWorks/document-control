import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedMemberAdminService } from "../../src/application/authorized-member-admin-service";
import type { MemberAdminService } from "../../src/application/member-admin-service";

const context = {
  subjectId: "admin-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(deny = false) {
  const requests: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (deny) throw new AuthorizationDeniedError();
    },
  };
  const getDirectory = vi.fn().mockResolvedValue({ members: [] });
  const createDirectMember = vi.fn().mockResolvedValue({ members: [] });
  const transitionMembership = vi.fn().mockResolvedValue({ members: [] });
  const members = {
    getDirectory,
    createDirectMember,
    transitionMembership,
  } as unknown as MemberAdminService;
  return {
    service: new AuthorizedMemberAdminService(members, authorization),
    requests,
    getDirectory,
    createDirectMember,
    transitionMembership,
  };
}

describe("AuthorizedMemberAdminService", () => {
  it("requires tenant.manage for directory reads and member mutations", async () => {
    const read = createHarness();
    await read.service.getDirectory(context);
    expect(read.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "tenant.manage",
      },
    ]);

    const create = createHarness();
    await create.service.createDirectMember(context, {
      membershipId: "membership-local-1",
      subjectId: "subject-local-1",
      providerSubject: "local-subject-1",
      displayName: "Jordan Smith",
      email: "jordan@example.com",
      initialStatus: "invited",
      auditEventId: "audit-create",
      occurredAt: "2026-08-11T22:30:00.000Z",
    });
    expect(create.requests[0]?.permission).toBe("tenant.manage");
    expect(create.createDirectMember).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorSubjectId: context.subjectId,
        subjectId: "subject-local-1",
      }),
    );
  });

  it("denies member mutations before the underlying service runs", async () => {
    const harness = createHarness(true);
    await expect(
      harness.service.transitionMembership(context, {
        membershipId: "membership-1",
        targetStatus: "suspended",
        auditEventId: "audit-suspend",
        occurredAt: "2026-08-11T22:31:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(harness.transitionMembership).not.toHaveBeenCalled();
  });
});
