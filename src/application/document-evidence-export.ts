import type { DocumentDetailEvidence } from "./document-detail-read-service";

export const documentEvidenceFormat = "document-evidence/v1" as const;

type PrimitiveEvidenceValue = string | number | boolean;

export interface DocumentEvidenceManifestV1 {
  format: typeof documentEvidenceFormat;
  generatedAt: string;
  document: {
    id: string;
    workspaceId: string;
    workspaceName: string;
    title: string;
    status: string;
    currentVersionId?: string;
    createdAt: string;
    updatedAt: string;
    sourceTemplate?: DocumentDetailEvidence["sourceTemplate"];
    versions: readonly {
      id: string;
      versionNumber: number;
      contentHash: string;
      contentProvider: string;
      createdByName: string;
      createdAt: string;
      isCurrent: boolean;
      exactApprovalApplies: boolean;
      approvals: readonly {
        id: string;
        actorName: string;
        contentHash: string;
        workflowInstanceId: string;
        workflowDefinitionId: string;
        workflowDefinitionVersion: number;
        approvedAt: string;
      }[];
      workflows: readonly {
        id: string;
        definitionId: string;
        definitionName: string;
        definitionVersion: number;
        state: string;
        createdAt: string;
        updatedAt: string;
        reviews: readonly {
          id: string;
          actorName: string;
          decision: string;
          comment?: string;
          createdAt: string;
        }[];
      }[];
    }[];
    auditEvents: readonly {
      id: string;
      eventType: string;
      entityType: string;
      entityId: string;
      actorName: string;
      occurredAt: string;
      evidence: Readonly<Record<string, PrimitiveEvidenceValue>>;
    }[];
  };
}

export function createDocumentEvidenceManifest(
  detail: DocumentDetailEvidence,
  generatedAt: string,
): DocumentEvidenceManifestV1 {
  return {
    format: documentEvidenceFormat,
    generatedAt,
    document: {
      id: detail.id,
      workspaceId: detail.workspaceId,
      workspaceName: detail.workspaceName,
      title: detail.title,
      status: detail.status,
      currentVersionId: detail.currentVersionId,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      sourceTemplate: detail.sourceTemplate,
      versions: detail.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        contentHash: version.contentHash,
        contentProvider: version.contentProvider,
        createdByName: version.createdByName,
        createdAt: version.createdAt,
        isCurrent: version.isCurrent,
        exactApprovalApplies: version.exactApprovalApplies,
        approvals: version.approvals.map((approval) => ({
          id: approval.id,
          actorName: approval.actorName,
          contentHash: approval.contentHash,
          workflowInstanceId: approval.workflowInstanceId,
          workflowDefinitionId: approval.workflowDefinitionId,
          workflowDefinitionVersion: approval.workflowDefinitionVersion,
          approvedAt: approval.approvedAt,
        })),
        workflows: version.workflows.map((workflow) => ({
          id: workflow.id,
          definitionId: workflow.definitionId,
          definitionName: workflow.definitionName,
          definitionVersion: workflow.definitionVersion,
          state: workflow.state,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          reviews: workflow.reviews.map((review) => ({
            id: review.id,
            actorName: review.actorName,
            decision: review.decision,
            comment: review.comment,
            createdAt: review.createdAt,
          })),
        })),
      })),
      auditEvents: detail.auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        actorName: event.actorName,
        occurredAt: event.occurredAt,
        evidence: summarizeAuditPayload(event.payload),
      })),
    },
  };
}

export function serializeDocumentEvidenceManifest(
  detail: DocumentDetailEvidence,
  generatedAt: string,
): string {
  return `${JSON.stringify(createDocumentEvidenceManifest(detail, generatedAt), null, 2)}\n`;
}

function summarizeAuditPayload(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, PrimitiveEvidenceValue>> {
  return Object.fromEntries(
    Object.entries(payload)
      .filter((entry): entry is [string, PrimitiveEvidenceValue] =>
        ["string", "number", "boolean"].includes(typeof entry[1]),
      )
      .slice(0, 6),
  );
}
