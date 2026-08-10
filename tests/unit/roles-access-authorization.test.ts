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

function createHarness(allowed: boolean) {
  const requests: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (!allowed) throw new AuthorizationDeniedError();
    },
  };
  const getWorkspaceAccess = vi.fn().mockResolvedValue({});
  const assignWorkspaceRole = vi.fn().mockResolvedValue({ changed: true });
  const removeWorkspaceRole = vi.fn().mockResolvedValue({ changed: true });
  const access = {
    getWorkspaceAccess,
    assignWorkspaceRole,
    removeWorkspaceRole,
  } as unknown as RolesAccessAdminService;
  return {
    service: new AuthorizedRolesAccessAdminService(access, authorization),
    requests,
    getWorkspaceAccess,
    assignWorkspaceRole,
    removeWorkspaceRole,
  };
}

describe("AuthorizedRolesAccessAdminService", () => {
  it("requires role.manage at the current workspace scope", async () => {
    const harness = createHarness(true);
    await harness.service.getWorkspaceAccess(context);

    expect(harness.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "role.manage",
      },
    ]);
    expect(harness.getWorkspaceAccess).toHaveBeenCalledWith(
      context.tenantId,
      context.workspaceId,
    );
  });

  it("denies mutations before the underlying service executes", async () => {
    const assign = createHarness(false);
    await expect(
      assign.service.assignWorkspaceRole(context, {
        subjectId: "member-1",
        roleDefinitionId: "role-viewer",
        bindingId: "binding-1",
        auditEventId: "audit-1",
        occurredAt: "2026-08-10T23:10:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(assign.assignWorkspaceRole).not.toHaveBeenCalled();

    const remove = createHarness(false);
    await expect(
      remove.service.removeWorkspaceRole(context, {
        bindingId: "binding-1",
        auditEventId: "audit-2",
        occurredAt: "2026-08-10T23:10:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(remove.removeWorkspaceRole).not.toHaveBeenCalled();
  });
});
