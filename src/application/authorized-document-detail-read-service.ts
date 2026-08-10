import type { AuthorizationPolicy } from "./authorization";
import type { DocumentDetailEvidence } from "./document-detail-read-service";

export interface DocumentDetailReadContext {
  subjectId: string;
  tenantId: string;
  documentId: string;
}

export interface DocumentDetailReader {
  getDocumentDetail(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentDetailEvidence>;
}

export class AuthorizedDocumentDetailReadService {
  public constructor(
    private readonly read: DocumentDetailReader,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getDocumentDetail(
    context: DocumentDetailReadContext,
  ): Promise<DocumentDetailEvidence> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      documentId: context.documentId,
      permission: "document.read",
    });
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      documentId: context.documentId,
      permission: "audit.read",
    });
    return this.read.getDocumentDetail(context.tenantId, context.documentId);
  }
}
