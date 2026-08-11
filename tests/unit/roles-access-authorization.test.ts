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

function createHarness(denyAt: number | null = null) {
  const requests: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (denyAt !== null && requests.length === denyAt) {
        throw new AuthorizationDeniedError();
      }
    },
  };
  const getWorkspaceAccess = vi.fn().mockResolvedValue({});
  const createCustomWorkspaceRole = vi
    .fn()
    .mockResolvedValue({ changed: true });
  const updateCustomWorkspaceRole = vi
    .fn()
    .mockResolvedValue({ changed: true });
  const assignWorkspaceRole = vi.fn().mockResolvedValue({ changed: true });
  const removeWorkspaceRole = vi.fn().mockResolvedValue({ changed: true });
  const access = {
    getWorkspaceAccess,
    createCustomWorkspaceRole,
    updateCustomWorkspaceRole,
    assignWorkspaceRole,
    removeWorkspaceRole,
  } as unknown as RolesAccessAdminService;
  return {
    service: new AuthorizedRolesAccessAdminService(access, authorization),
    requests,
    getWorkspaceAccess,
    createCustomWorkspaceRole,
    updateCustomWorkspaceRole,
    assignWorkspaceRole,
    removeWorkspaceRole,
  };
}

describe("AuthorizedRolesAccessAdminService", () => {
  it("requires role.manage at the current workspace scope for reads and assignments", async () => {
    const harness = createHarness();
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

  it("requires tenant.manage plus workspace role.manage for tenant-owned role definitions", async () => {
    const create = createHarness();
    await create.service.createCustomWorkspaceRole(context, {
      roleDefinitionId: "role-custom-1",
      roleKey: "custom_1",
      name: "Records Coordinator",
      permissions: ["document.read", "audit.read"],
      auditEventId: "audit-create-role",
      occurredAt: "2026-08-11T22:00:00.000Z",
    });

    expect(create.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "tenant.manage",
      },
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "role.manage",
      },
    ]);
    expect(create.createCustomWorkspaceRole).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorSubjectId: context.subjectId,
        roleDefinitionId: "role-custom-1",
      }),
    );

    const update = createHarness();
    await update.service.updateCustomWorkspaceRole(context, {
      roleDefinitionId: "role-custom-1",
      name: "Records Lead",
      permissions: ["document.read", "document.review"],
      acknowledgeAssignments: true,
      auditEventId: "audit-update-role",
      occurredAt: "2026-08-11T22:01:00.000Z",
    });
    expect(update.requests.map((request) => request.permission)).toEqual([
      "tenant.manage",
      "role.manage",
    ]);
  });

  it("denies custom-role mutation before the underlying service executes", async () => {
    const tenantDenied = createHarness(1);
    await expect(
      tenantDenied.service.createCustomWorkspaceRole(context, {
        roleDefinitionId: "role-custom-1",
        roleKey: "custom_1",
        name: "Records Coordinator",
        permissions: ["document.read"],
        auditEventId: "audit-1",
        occurredAt: "2026-08-11T22:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(tenantDenied.createCustomWorkspaceRole).not.toHaveBeenCalled();

    const roleDenied = createHarness(2);
    await expect(
      roleDenied.service.updateCustomWorkspaceRole(context, {
        roleDefinitionId: "role-custom-1",
        name: "Records Lead",
        permissions: ["document.read"],
        acknowledgeAssignments: false,
        auditEventId: "audit-2",
        occurredAt: "2026-08-11T22:01:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(roleDenied.updateCustomWorkspaceRole).not.toHaveBeenCalled();
  });

  it("denies assignment mutations before the underlying service executes", async () => {
    const assign = createHarness(1);
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

    const remove = createHarness(1);
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
