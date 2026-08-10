import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../../src/application/authorization";
import { AuthorizedPortableExportService } from "../../src/application/authorized-portable-export-service";
import type { PortableExportReadService } from "../../src/application/portable-export-read-service";

const context = {
  subjectId: "subject-tenant-admin",
  tenantId: "tenant-1",
  exportedAt: "2026-08-10T21:00:00.000Z",
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
  const createTenantExport = vi.fn().mockResolvedValue({ format: "test" });
  const read = {
    createTenantExport,
  } as unknown as PortableExportReadService;

  return {
    service: new AuthorizedPortableExportService(read, authorization),
    assertions,
    createTenantExport,
  };
}

describe("AuthorizedPortableExportService", () => {
  it("requires export.create at tenant scope", async () => {
    const harness = createHarness();

    await harness.service.createTenantExport(context);

    expect(harness.assertions).toEqual([
      {
        subjectId: context.subjectId,
        tenantId: context.tenantId,
        permission: "export.create",
      },
    ]);
    expect(harness.createTenantExport).toHaveBeenCalledWith(
      context.tenantId,
      context.exportedAt,
    );
  });

  it("does not read tenant data after authorization denial", async () => {
    const harness = createHarness(true);

    await expect(harness.service.createTenantExport(context)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    expect(harness.createTenantExport).not.toHaveBeenCalled();
  });
});
