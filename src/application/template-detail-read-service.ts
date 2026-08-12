import type { DatabaseProvider } from "./ports";

export class TemplateNotFoundError extends Error {
  public constructor() {
    super("Template was not found in the requested workspace.");
    this.name = "TemplateNotFoundError";
  }
}

export interface TemplateVersionEvidence {
  id: string;
  versionNumber: number;
  lifecycleState: string;
  contentHash: string;
  provenance: string;
  createdByName: string;
  createdAt: string;
  publishedAt?: string;
  supersededAt?: string;
  isCurrent: boolean;
}

export interface TemplateDetailEvidence {
  id: string;
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  currentVersion?: number;
  createdAt: string;
  versions: readonly TemplateVersionEvidence[];
}

interface TemplateRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  currentVersion: number | null;
  createdAt: string;
}

interface TemplateVersionRow {
  id: string;
  versionNumber: number;
  lifecycleState: string;
  contentHash: string;
  provenance: string;
  createdByName: string;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
}

export class TemplateDetailReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getTemplateDetail(
    tenantId: string,
    workspaceId: string,
    templateId: string,
  ): Promise<TemplateDetailEvidence> {
    const [template] = await this.database.query<TemplateRow>(
      `SELECT
         template.id,
         template.tenant_id AS tenantId,
         template.workspace_id AS workspaceId,
         workspace.name AS workspaceName,
         template.name,
         template.current_version AS currentVersion,
         template.created_at AS createdAt
       FROM templates template
       JOIN workspaces workspace
         ON workspace.id = template.workspace_id
        AND workspace.tenant_id = template.tenant_id
       WHERE template.tenant_id = ?
         AND template.workspace_id = ?
         AND template.id = ?`,
      [tenantId, workspaceId, templateId],
    );

    if (!template) {
      throw new TemplateNotFoundError();
    }

    const versions = await this.database.query<TemplateVersionRow>(
      `SELECT
         version.id,
         version.version_number AS versionNumber,
         version.lifecycle_state AS lifecycleState,
         version.content_hash AS contentHash,
         version.provenance,
         creator.display_name AS createdByName,
         version.created_at AS createdAt,
         version.published_at AS publishedAt,
         version.superseded_at AS supersededAt
       FROM template_versions version
       JOIN identity_subjects creator
         ON creator.id = version.created_by_subject_id
       WHERE version.tenant_id = ? AND version.template_id = ?
       ORDER BY version.version_number DESC`,
      [tenantId, templateId],
    );

    return {
      id: template.id,
      tenantId: template.tenantId,
      workspaceId: template.workspaceId,
      workspaceName: template.workspaceName,
      name: template.name,
      currentVersion: template.currentVersion ?? undefined,
      createdAt: template.createdAt,
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: Number(version.versionNumber),
        lifecycleState: version.lifecycleState,
        contentHash: version.contentHash,
        provenance: version.provenance,
        createdByName: version.createdByName,
        createdAt: version.createdAt,
        publishedAt: version.publishedAt ?? undefined,
        supersededAt: version.supersededAt ?? undefined,
        isCurrent: template.currentVersion === Number(version.versionNumber),
      })),
    };
  }
}
