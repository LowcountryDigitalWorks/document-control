import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedTemplateLifecycleAdminService } from "../../src/application/authorized-template-lifecycle-admin-service";
import type { TemplateLifecycleAdminService } from "../../src/application/template-lifecycle-admin-service";

const context = {
  subjectId: "template-manager",
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
  const getCatalog = vi.fn().mockResolvedValue({ versions: [] });
  const transitionVersion = vi.fn().mockResolvedValue({ lifecycleState: "review" });
  const templates = {
    getCatalog,
    transitionVersion,
  } as unknown as TemplateLifecycleAdminService;
  return {
    service: new AuthorizedTemplateLifecycleAdminService(
      templates,
      authorization,
    ),
    requests,
    getCatalog,
    transitionVersion,
  };
}

describe("AuthorizedTemplateLifecycleAdminService", () => {
  it("requires template.manage at the current workspace", async () => {
    const harness = createHarness(true);
    await harness.service.getCatalog(context);
    expect(harness.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "template.manage",
      },
    ]);
    expect(harness.getCatalog).toHaveBeenCalledWith(
      context.tenantId,
      context.workspaceId,
    );
  });

  it("denies a lifecycle mutation before persistence executes", async () => {
    const harness = createHarness(false);
    await expect(
      harness.service.transitionVersion(context, {
        templateVersionId: "template-version-1",
        targetState: "review",
        auditEventId: "audit-1",
        occurredAt: "2026-08-10T23:55:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(harness.transitionVersion).not.toHaveBeenCalled();
  });
});
