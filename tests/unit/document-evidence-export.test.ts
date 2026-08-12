import { describe, expect, it } from "vitest";
import {
  createDocumentEvidenceManifest,
  serializeDocumentEvidenceManifest,
} from "../../src/application/document-evidence-export";
import type { DocumentDetailEvidence } from "../../src/application/document-detail-read-service";

const detail: DocumentDetailEvidence = {
  id: "document-1",
  tenantId: "tenant-internal",
  workspaceId: "workspace-1",
  workspaceName: "Harbor Operations",
  title: "Harbor Opening Checklist",
  status: "approved",
  currentVersionId: "version-1",
  createdAt: "2026-08-12T14:00:00.000Z",
  updatedAt: "2026-08-12T14:30:00.000Z",
  sourceTemplate: {
    id: "template-1",
    name: "Standard Operating Procedure",
    versionNumber: 1,
    contentHash: "a".repeat(64),
    lifecycleState: "published",
    provenance: "Controlled seed template",
  },
  versions: [
    {
      id: "version-1",
      versionNumber: 1,
      contentHash: "b".repeat(64),
      contentProvider: "r2",
      createdBySubjectId: "creator-internal",
      createdByName: "Casey Author",
      createdAt: "2026-08-12T14:00:00.000Z",
      isCurrent: true,
      exactApprovalApplies: true,
      approvals: [
        {
          id: "approval-1",
          actorSubjectId: "approver-internal",
          actorName: "Alex Approver",
          contentHash: "b".repeat(64),
          workflowInstanceId: "workflow-1",
          workflowDefinitionId: "definition-1",
          workflowDefinitionVersion: 1,
          approvedAt: "2026-08-12T14:30:00.000Z",
        },
      ],
      workflows: [
        {
          id: "workflow-1",
          definitionId: "definition-1",
          definitionName: "Standard review and approval",
          definitionVersion: 1,
          state: "approved",
          createdAt: "2026-08-12T14:05:00.000Z",
          updatedAt: "2026-08-12T14:30:00.000Z",
          reviews: [
            {
              id: "review-1",
              actorSubjectId: "reviewer-internal",
              actorName: "Riley Reviewer",
              decision: "accepted",
              comment: "Evidence is complete.",
              createdAt: "2026-08-12T14:20:00.000Z",
            },
          ],
        },
      ],
    },
  ],
  auditEvents: [
    {
      id: "audit-1",
      eventType: "document.version.approved",
      entityType: "document_version",
      entityId: "version-1",
      actorSubjectId: "approver-internal",
      actorName: "Alex Approver",
      occurredAt: "2026-08-12T14:30:00.000Z",
      payload: {
        version: 1,
        approved: true,
        nested: { hidden: "not exported" },
        list: ["not exported"],
      },
    },
  ],
};

describe("document evidence manifest export", () => {
  it("preserves exact document evidence while excluding internal subject identifiers", () => {
    const manifest = createDocumentEvidenceManifest(
      detail,
      "2026-08-12T15:00:00.000Z",
    );

    expect(manifest.format).toBe("document-evidence/v1");
    expect(manifest.document.sourceTemplate?.contentHash).toBe("a".repeat(64));
    expect(manifest.document.versions[0]?.contentHash).toBe("b".repeat(64));
    expect(
      manifest.document.versions[0]?.approvals[0]?.workflowDefinitionVersion,
    ).toBe(1);
    expect(manifest.document.auditEvents[0]?.evidence).toEqual({
      version: 1,
      approved: true,
    });

    const serialized = serializeDocumentEvidenceManifest(
      detail,
      "2026-08-12T15:00:00.000Z",
    );
    expect(serialized).not.toContain("tenant-internal");
    expect(serialized).not.toContain("creator-internal");
    expect(serialized).not.toContain("approver-internal");
    expect(serialized).not.toContain("reviewer-internal");
    expect(serialized).not.toContain("not exported");
  });

  it("keeps only the first six primitive audit payload fields", () => {
    const withManyAuditFields: DocumentDetailEvidence = {
      ...detail,
      auditEvents: [
        {
          ...detail.auditEvents[0]!,
          payload: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 },
        },
      ],
    };

    expect(
      createDocumentEvidenceManifest(
        withManyAuditFields,
        "2026-08-12T15:00:00.000Z",
      ).document.auditEvents[0]?.evidence,
    ).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
  });
});
