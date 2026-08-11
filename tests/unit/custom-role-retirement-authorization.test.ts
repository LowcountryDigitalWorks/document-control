import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedRolesAccessAdminService } from "../../src/application/authorized-roles-access-admin-service";
import type { RolesAccessAdminService } from "../../src/application/roles-access-admin-service";

const context = {
  subjectId: "admin-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function harness(denyAt: number | null = null) {
  const requests: AuthorizationRequest[] = [];
  const retireCustomWorkspaceRole = vi.fn().mockResolvedValue({ changed: true });
  const access = { retireCustomWorkspaceRole } as unknown as RolesAccessAdminService;
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (denyAt !== null && requests.length === denyAt) {
        throw new AuthorizationDeniedError();
      }
    },
  };
  return {
    service: new AuthorizedRolesAccessAdminService(access, authorization),
    requests,
    retireCustomWorkspaceRole,
  };
}

describe("custom role retirement authorization", () => {
  it("requires tenant.manage plus current-workspace role.manage", async () => {
    const test = harness();
    await test.service.retireCustomWorkspaceRole(context, {
      roleDefinitionId: "role-custom-records",
      auditEventId: "audit-retire",
      occurredAt: "2026-08-11T22:45:00.000Z",
    });
    expect(test.requests.map((request) => request.permission)).toEqual([
      "tenant.manage",
      "role.manage",
    ]);
    expect(test.retireCustomWorkspaceRole).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorSubjectId: context.subjectId,
        roleDefinitionId: "role-custom-records",
      }),
    );
  });

  it("denies retirement before the underlying service executes", async () => {
    for (const denyAt of [1, 2]) {
      const test = harness(denyAt);
      await expect(
        test.service.retireCustomWorkspaceRole(context, {
          roleDefinitionId: "role-custom-records",
          auditEventId: `audit-retire-${denyAt}`,
          occurredAt: "2026-08-11T22:45:00.000Z",
        }),
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      expect(test.retireCustomWorkspaceRole).not.toHaveBeenCalled();
    }
  });
});
