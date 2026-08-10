import type {
  Approval,
  DocumentVersion,
  Identifier,
  IsoTimestamp,
  WorkflowDefinition,
  WorkflowInstance,
} from "./models";

export interface ApprovalCommand {
  id: Identifier;
  actorSubjectId: Identifier;
  approvedAt: IsoTimestamp;
  documentVersion: DocumentVersion;
  workflowDefinition: WorkflowDefinition;
  workflowInstance: WorkflowInstance;
}

export function approveExactVersion(command: ApprovalCommand): Approval {
  const { documentVersion, workflowDefinition, workflowInstance } = command;

  if (!/^sha256:[a-f0-9]{64}$/.test(documentVersion.contentHash)) {
    throw new Error("Approval requires a canonical SHA-256 content hash.");
  }

  if (workflowDefinition.version < 1) {
    throw new Error("Approval requires a versioned workflow definition.");
  }

  if (
    workflowDefinition.tenantId !== documentVersion.tenantId ||
    workflowInstance.tenantId !== documentVersion.tenantId ||
    workflowInstance.documentId !== documentVersion.documentId ||
    workflowInstance.documentVersionId !== documentVersion.id ||
    workflowInstance.workflowDefinitionId !== workflowDefinition.id ||
    workflowInstance.workflowDefinitionVersion !== workflowDefinition.version
  ) {
    throw new Error(
      "Approval requires an exact document version and its bound workflow-definition version.",
    );
  }

  return Object.freeze({
    id: command.id,
    tenantId: documentVersion.tenantId,
    documentId: documentVersion.documentId,
    documentVersionId: documentVersion.id,
    contentHash: documentVersion.contentHash,
    actorSubjectId: command.actorSubjectId,
    workflowInstanceId: workflowInstance.id,
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
