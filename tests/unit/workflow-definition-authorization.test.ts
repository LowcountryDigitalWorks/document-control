import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedWorkflowDefinitionAdminService } from "../../src/application/authorized-workflow-definition-admin-service";
import type { WorkflowDefinitionAdminService } from "../../src/application/workflow-definition-admin-service";

const context = {
  subjectId: "tenant-admin",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(denyAt: number | null = null) {
  const requests: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      requests.push(request);
      if (denyAt === requests.length) throw new AuthorizationDeniedError();
    },
  };
  const getCatalog = vi.fn().mockResolvedValue({ definitions: [] });
  const createDefinition = vi.fn().mockResolvedValue({ version: 1 });
  const createVersion = vi.fn().mockResolvedValue({ version: 2 });
  const transitionLifecycle = vi.fn().mockResolvedValue({
    id: "workflow-1",
    version: 1,
    lifecycleState: "deprecated",
  });
  const workflows = {
    getCatalog,
    createDefinition,
    createVersion,
    transitionLifecycle,
  } as unknown as WorkflowDefinitionAdminService;
  return {
    service: new AuthorizedWorkflowDefinitionAdminService(
      workflows,
      authorization,
    ),
    requests,
    getCatalog,
    createDefinition,
    createVersion,
    transitionLifecycle,
  };
}

describe("AuthorizedWorkflowDefinitionAdminService", () => {
  it("requires tenant.manage and workflow.manage before reading the catalog", async () => {
    const harness = createHarness();
    await harness.service.getCatalog(context);

    expect(harness.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "tenant.manage",
      },
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

  it("stops before workflow persistence if either permission is denied", async () => {
    const tenantDenied = createHarness(1);
    await expect(
      tenantDenied.service.createDefinition(context, {
        workflowDefinitionId: "workflow-1",
        auditEventId: "audit-1",
        occurredAt: "2026-08-10T23:35:00.000Z",
        input: { name: "Workflow", states: ["draft"], transitions: [] },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(tenantDenied.createDefinition).not.toHaveBeenCalled();

    const workflowDenied = createHarness(2);
    await expect(
      workflowDenied.service.createVersion(context, {
        workflowDefinitionId: "workflow-1",
        auditEventId: "audit-2",
        occurredAt: "2026-08-10T23:35:00.000Z",
        input: { name: "Workflow", states: ["draft"], transitions: [] },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(workflowDenied.createVersion).not.toHaveBeenCalled();
  });

  it("uses the same dual authorization boundary before lifecycle mutation", async () => {
    const allowed = createHarness();
    await allowed.service.transitionLifecycle(context, {
      workflowDefinitionId: "workflow-1",
      workflowDefinitionVersion: 1,
      targetState: "deprecated",
      auditEventId: "audit-lifecycle",
      occurredAt: "2026-08-11T18:50:00.000Z",
    });

    expect(allowed.requests).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "tenant.manage",
      },
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        permission: "workflow.manage",
      },
    ]);
    expect(allowed.transitionLifecycle).toHaveBeenCalledWith({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
      workflowDefinitionId: "workflow-1",
      workflowDefinitionVersion: 1,
      targetState: "deprecated",
      auditEventId: "audit-lifecycle",
      occurredAt: "2026-08-11T18:50:00.000Z",
    });

    const denied = createHarness(2);
    await expect(
      denied.service.transitionLifecycle(context, {
        workflowDefinitionId: "workflow-1",
        workflowDefinitionVersion: 1,
        targetState: "deprecated",
        auditEventId: "audit-denied",
        occurredAt: "2026-08-11T18:50:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denied.transitionLifecycle).not.toHaveBeenCalled();
  });
});
