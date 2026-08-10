import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedPresentationSettingsService } from "../../src/application/authorized-presentation-settings-service";
import type { PresentationSettingsService } from "../../src/application/presentation-settings-service";

const context = {
  subjectId: "subject-tenant-admin",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(denyAt: number | null = null) {
  const assertions: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      assertions.push(request);
      if (denyAt === assertions.length) throw new AuthorizationDeniedError();
    },
  };
  const getSettings = vi.fn().mockResolvedValue({ tenantId: context.tenantId });
  const updateSettings = vi.fn().mockResolvedValue({ changed: true });
  const settings = {
    getSettings,
    updateSettings,
  } as unknown as PresentationSettingsService;

  return {
    service: new AuthorizedPresentationSettingsService(settings, authorization),
    assertions,
    getSettings,
    updateSettings,
  };
}

describe("AuthorizedPresentationSettingsService", () => {
  it("requires tenant.manage and workspace.manage before reading settings", async () => {
    const harness = createHarness();

    await harness.service.getSettings(context);

    expect(harness.assertions).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "tenant.manage",
      },
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "workspace.manage",
      },
    ]);
    expect(harness.getSettings).toHaveBeenCalledWith(
      context.tenantId,
      context.workspaceId,
    );
  });

  it("stops before persistence when either administration permission is denied", async () => {
    const tenantDenied = createHarness(1);
    await expect(
      tenantDenied.service.getSettings(context),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(tenantDenied.getSettings).not.toHaveBeenCalled();

    const workspaceDenied = createHarness(2);
    await expect(
      workspaceDenied.service.updateSettings(context, {
        occurredAt: "2026-08-10T22:40:00.000Z",
        auditEventId: "audit-settings",
        input: {
          workspaceName: "Operations",
          appName: "Document Control",
          companyName: "Lowcountry Digital Works",
          primary: "#163b45",
          secondary: "#247b78",
          accent: "#8e4228",
          workspaceTerm: "Workspace",
          documentTerm: "Document",
          approvalTerm: "Approval",
        },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(workspaceDenied.updateSettings).not.toHaveBeenCalled();
  });
});
