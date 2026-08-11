import { describe, expect, it } from "vitest";
import { parseExport, serializeExport } from "../../src/application/export";
import { createSyntheticExport } from "../../src/demo/fixtures";

describe("portable export", () => {
  it("round-trips all synthetic application records", () => {
    const source = createSyntheticExport();
    expect(parseExport(serializeExport(source))).toEqual(source);
  });

  it("accepts legacy v1 exports without workspace workflow assignments", () => {
    const source = createSyntheticExport();
    const legacy = JSON.parse(JSON.stringify(source)) as Record<
      string,
      unknown
    >;
    delete legacy.workspaceWorkflowAssignments;
    expect(
      parseExport(JSON.stringify(legacy)).workspaceWorkflowAssignments,
    ).toBeUndefined();
  });

  it("rejects workspace workflow assignments that cross tenant or definition boundaries", () => {
    const source = createSyntheticExport();
    const tampered = {
      ...source,
      workspaceWorkflowAssignments: [
        {
          tenantId: source.tenant.id,
          workspaceId: source.workspaces[0]!.id,
          workflowDefinitionId: "missing-workflow",
          workflowDefinitionVersion: 1,
          isDefault: true,
          createdBySubjectId: source.identitySubjects[0]!.id,
          createdAt: source.exportedAt,
          updatedBySubjectId: source.identitySubjects[0]!.id,
          updatedAt: source.exportedAt,
        },
      ],
    };
    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /missing workflow definition version/,
    );
  });

  it("rejects unknown export versions", () => {
    const source = createSyntheticExport();
    expect(() =>
      parseExport(JSON.stringify({ ...source, version: 2 })),
    ).toThrow(/Unsupported/);
  });

  it("rejects cross-tenant records", () => {
    const source = createSyntheticExport();
    const workspace = source.workspaces[0]!;
    const tampered = {
      ...source,
      workspaces: [{ ...workspace, tenantId: "tenant-other" }],
    };

    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /tenant boundary/,
    );
  });

  it("rejects approvals whose hash no longer matches the document version", () => {
    const source = createSyntheticExport();
    const approval = source.approvals[0]!;
    const tampered = {
      ...source,
      approvals: [
        {
          ...approval,
          contentHash: `sha256:${"f".repeat(64)}`,
        },
      ],
    };

    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /exact evidence/,
    );
  });

  it("rejects incomplete top-level structures instead of casting them", () => {
    const source = createSyntheticExport();
    const withoutReviews = JSON.parse(JSON.stringify(source)) as Record<
      string,
      unknown
    >;
    delete withoutReviews.reviews;

    expect(() => parseExport(JSON.stringify(withoutReviews))).toThrow(
      /reviews must be an array/,
    );
  });
});
