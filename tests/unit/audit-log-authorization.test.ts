import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedAuditLogReadService } from "../../src/application/authorized-audit-log-read-service";
import type { AuditLogReadService } from "../../src/application/audit-log-read-service";

const context = {
  subjectId: "subject-auditor",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
};

function createHarness(deny = false) {
  const assertions: AuthorizationRequest[] = [];
  const authorization: AuthorizationPolicy = {
    async assertAllowed(request) {
      assertions.push(request);
      if (deny) {
        throw new AuthorizationDeniedError();
      }
    },
  };
  const listAuditEvents = vi.fn().mockResolvedValue([]);
  const read = { listAuditEvents } as unknown as AuditLogReadService;
  return {
    service: new AuthorizedAuditLogReadService(read, authorization),
    assertions,
    listAuditEvents,
  };
}

describe("AuthorizedAuditLogReadService", () => {
  it("requires audit.read at workspace scope", async () => {
    const harness = createHarness();
    const filters = { query: "approval" };

    await harness.service.listAuditEvents(context, filters);

    expect(harness.assertions).toEqual([
      {
        ...context,
        permission: "audit.read",
      },
    ]);
    expect(harness.listAuditEvents).toHaveBeenCalledWith(
      context.tenantId,
      context.workspaceId,
      filters,
    );
  });

  it("does not query audit data after authorization denial", async () => {
    const harness = createHarness(true);

    await expect(harness.service.listAuditEvents(context)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    expect(harness.listAuditEvents).not.toHaveBeenCalled();
  });
});
