import type { DatabaseProvider } from "./ports";

export const documentStatuses = [
  "draft",
  "in_review",
  "approved",
  "superseded",
  "retired",
] as const;
export type DocumentStatusFilter = (typeof documentStatuses)[number];

export const templateLifecycleStates = [
  "draft",
  "review",
  "approved",
  "published",
  "superseded",
  "retired",
] as const;
export type TemplateLifecycleFilter = (typeof templateLifecycleStates)[number];

export type CurrentApprovalFilter = "approved" | "required";

export interface WorkspaceDocumentFilters {
  query?: string;
  status?: DocumentStatusFilter;
  currentApproval?: CurrentApprovalFilter;
}

export interface WorkspaceTemplateFilters {
  query?: string;
  lifecycle?: TemplateLifecycleFilter;
}

export interface WorkspaceOverview {
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  documentCount: number;
  templateCount: number;
  currentApprovedCount: number;
  reviewQueueCount: number;
}

export interface WorkspaceDocumentListItem {
  id: string;
  title: string;
  status: string;
  currentVersionId?: string;
  currentVersionNumber?: number;
  currentVersionHash?: string;
  exactCurrentApproval: boolean;
  updatedAt: string;
}

export interface WorkspaceTemplateListItem {
  id: string;
  name: string;
  currentVersion?: number;
  lifecycleState?: string;
  contentHash?: string;
  provenance?: string;
}

interface WorkspaceOverviewRow {
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  documentCount: number;
  templateCount: number;
  currentApprovedCount: number;
  reviewQueueCount: number;
}

interface DocumentRow {
  id: string;
  title: string;
  status: string;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentVersionHash: string | null;
  exactCurrentApproval: number;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  name: string;
  currentVersion: number | null;
  lifecycleState: string | null;
  contentHash: string | null;
  provenance: string | null;
}

const maximumListResults = 100;

export class WorkspaceReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getOverview(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceOverview> {
    const [row] = await this.database.query<WorkspaceOverviewRow>(
      `SELECT
         workspace.tenant_id AS tenantId,
         workspace.id AS workspaceId,
         workspace.name AS workspaceName,
         (SELECT COUNT(*) FROM documents document
           WHERE document.tenant_id = workspace.tenant_id
             AND document.workspace_id = workspace.id) AS documentCount,
         (SELECT COUNT(*) FROM templates template
           WHERE template.tenant_id = workspace.tenant_id
             AND template.workspace_id = workspace.id) AS templateCount,
         (SELECT COUNT(*) FROM documents document
           JOIN document_versions version
             ON version.id = document.current_version_id
            AND version.tenant_id = document.tenant_id
            AND version.document_id = document.id
           WHERE document.tenant_id = workspace.tenant_id
             AND document.workspace_id = workspace.id
             AND EXISTS (
               SELECT 1 FROM approvals approval
               WHERE approval.tenant_id = document.tenant_id
                 AND approval.document_id = document.id
                 AND approval.document_version_id = version.id
                 AND approval.content_hash = version.content_hash
             )) AS currentApprovedCount,
         (SELECT COUNT(*) FROM documents document
           WHERE document.tenant_id = workspace.tenant_id
             AND document.workspace_id = workspace.id
             AND document.status = 'in_review') AS reviewQueueCount
       FROM workspaces workspace
       WHERE workspace.tenant_id = ? AND workspace.id = ?`,
      [tenantId, workspaceId],
    );

    if (!row) {
      throw new Error("Workspace was not found in the requested tenant.");
    }

    return {
      ...row,
      documentCount: Number(row.documentCount),
      templateCount: Number(row.templateCount),
      currentApprovedCount: Number(row.currentApprovedCount),
      reviewQueueCount: Number(row.reviewQueueCount),
    };
  }

  public async listDocuments(
    tenantId: string,
    workspaceId: string,
    filters: WorkspaceDocumentFilters = {},
  ): Promise<readonly WorkspaceDocumentListItem[]> {
    const conditions = ["document.tenant_id = ?", "document.workspace_id = ?"];
    const parameters: unknown[] = [tenantId, workspaceId];

    if (filters.query) {
      conditions.push("document.title COLLATE NOCASE LIKE ? ESCAPE '\\'");
      parameters.push(`%${escapeLikePattern(filters.query)}%`);
    }
    if (filters.status) {
      conditions.push("document.status = ?");
      parameters.push(filters.status);
    }
    if (filters.currentApproval) {
      const exactApproval = `version.id IS NOT NULL AND EXISTS (
        SELECT 1 FROM approvals approval_filter
        WHERE approval_filter.tenant_id = document.tenant_id
          AND approval_filter.document_id = document.id
          AND approval_filter.document_version_id = version.id
          AND approval_filter.content_hash = version.content_hash
      )`;
      conditions.push(
        filters.currentApproval === "approved"
          ? `(${exactApproval})`
          : `NOT (${exactApproval})`,
      );
    }

    const rows = await this.database.query<DocumentRow>(
      `SELECT
         document.id,
         document.title,
         document.status,
         document.current_version_id AS currentVersionId,
         version.version_number AS currentVersionNumber,
         version.content_hash AS currentVersionHash,
         CASE WHEN version.id IS NOT NULL AND EXISTS (
           SELECT 1 FROM approvals approval
           WHERE approval.tenant_id = document.tenant_id
             AND approval.document_id = document.id
             AND approval.document_version_id = version.id
             AND approval.content_hash = version.content_hash
         ) THEN 1 ELSE 0 END AS exactCurrentApproval,
         document.updated_at AS updatedAt
       FROM documents document
       LEFT JOIN document_versions version
         ON version.id = document.current_version_id
        AND version.tenant_id = document.tenant_id
        AND version.document_id = document.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY document.updated_at DESC, document.title COLLATE NOCASE ASC
       LIMIT ${maximumListResults}`,
      parameters,
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      currentVersionId: row.currentVersionId ?? undefined,
      currentVersionNumber: row.currentVersionNumber ?? undefined,
      currentVersionHash: row.currentVersionHash ?? undefined,
      exactCurrentApproval: row.exactCurrentApproval === 1,
      updatedAt: row.updatedAt,
    }));
  }

  public async listTemplates(
    tenantId: string,
    workspaceId: string,
    filters: WorkspaceTemplateFilters = {},
  ): Promise<readonly WorkspaceTemplateListItem[]> {
    const conditions = ["template.tenant_id = ?", "template.workspace_id = ?"];
    const parameters: unknown[] = [tenantId, workspaceId];

    if (filters.query) {
      conditions.push("template.name COLLATE NOCASE LIKE ? ESCAPE '\\'");
      parameters.push(`%${escapeLikePattern(filters.query)}%`);
    }
    if (filters.lifecycle) {
      conditions.push("version.lifecycle_state = ?");
      parameters.push(filters.lifecycle);
    }

    const rows = await this.database.query<TemplateRow>(
      `SELECT
         template.id,
         template.name,
         template.current_version AS currentVersion,
         version.lifecycle_state AS lifecycleState,
         version.content_hash AS contentHash,
         version.provenance
       FROM templates template
       LEFT JOIN template_versions version
         ON version.template_id = template.id
        AND version.tenant_id = template.tenant_id
        AND version.version_number = template.current_version
       WHERE ${conditions.join(" AND ")}
       ORDER BY template.name COLLATE NOCASE ASC
       LIMIT ${maximumListResults}`,
      parameters,
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      currentVersion: row.currentVersion ?? undefined,
      lifecycleState: row.lifecycleState ?? undefined,
      contentHash: row.contentHash ?? undefined,
      provenance: row.provenance ?? undefined,
    }));
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
