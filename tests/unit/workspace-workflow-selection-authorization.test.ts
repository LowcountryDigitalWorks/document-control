import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedWorkspaceWorkflowSelectionService } from "../../src/application/authorized-workspace-workflow-selection-service";
import type { WorkspaceWorkflowSelectionService } from "../../src/application/workspace-workflow-selection-service";

const context = {
  subjectId: "workflow-admin",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(denied = false) {
  const requests: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (denied) throw new AuthorizationDeniedError();
    },
  };
  const getCatalog = vi.fn().mockResolvedValue({ definitions: [] });
  const setApplicability = vi.fn().mockResolvedValue({ changed: true });
  const setDefault = vi.fn().mockResolvedValue({ changed: true });
  const selections = {
    getCatalog,
    setApplicability,
    setDefault,
  } as unknown as WorkspaceWorkflowSelectionService;
  return {
    service: new AuthorizedWorkspaceWorkflowSelectionService(
      selections,
      authorization,
    ),
    requests,
    getCatalog,
    setApplicability,
    setDefault,
  };
}

describe("AuthorizedWorkspaceWorkflowSelectionService", () => {
  it("requires workspace-scoped workflow.manage before reading selection policy", async () => {
    const harness = createHarness();
    await harness.service.getCatalog(context);

    expect(harness.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "workflow.manage",
      },
    ]);
    expect(harness.getCatalog).toHaveBeenCalledWith(
      context.tenantId,
      context.workspaceId,
    );
  });

  it("stops before selection persistence when workflow.manage is denied", async () => {
    const harness = createHarness(true);
    await expect(
      harness.service.setDefault(context, {
        workflowDefinitionId: "workflow-1",
        workflowDefinitionVersion: 1,
        auditEventId: "audit-default",
        occurredAt: "2026-08-11T17:30:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(harness.setDefault).not.toHaveBeenCalled();
    expect(harness.setApplicability).not.toHaveBeenCalled();
  });
});
