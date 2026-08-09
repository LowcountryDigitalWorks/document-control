import type {
  Approval,
  DocumentVersion,
  Identifier,
  IsoTimestamp,
  WorkflowDefinition,
} from "./models";

export interface ApprovalCommand {
  id: Identifier;
  actorId: Identifier;
  approvedAt: IsoTimestamp;
  documentVersion: DocumentVersion;
  workflowDefinition: WorkflowDefinition;
}

export function approveExactVersion(command: ApprovalCommand): Approval {
  const { documentVersion, workflowDefinition } = command;

  if (!/^sha256:[a-f0-9]{64}$/.test(documentVersion.contentHash)) {
    throw new Error("Approval requires a canonical SHA-256 content hash.");
  }

  if (workflowDefinition.version < 1) {
    throw new Error("Approval requires a versioned workflow definition.");
  }

  return Object.freeze({
    id: command.id,
    tenantId: documentVersion.tenantId,
    documentId: documentVersion.documentId,
    documentVersionId: documentVersion.id,
    contentHash: documentVersion.contentHash,
    actorId: command.actorId,
    workflowDefinitionId: workflowDefinition.id,
    workflowDefinitionVersion: workflowDefinition.version,
    approvedAt: command.approvedAt,
  });
}

export function approvalAppliesToVersion(
  approval: Approval,
  version: DocumentVersion,
): boolean {
  return (
    approval.tenantId === version.tenantId &&
    approval.documentId === version.documentId &&
    approval.documentVersionId === version.id &&
    approval.contentHash === version.contentHash
  );
}
