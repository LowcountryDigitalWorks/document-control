import type { TemplateLifecycleState, TemplateVersion } from "../domain/models";
import {
  availableTemplateTransitions,
  transitionTemplateVersion,
} from "../domain/template";
import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface TemplateLifecycleVersionRecord extends TemplateVersion {
  templateName: string;
  workspaceId: string;
  creatorName: string;
  isCurrent: boolean;
  sourceDocumentCount: number;
  availableTransitions: readonly TemplateLifecycleState[];
}

export interface TemplateLifecycleCatalog {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
  versions: readonly TemplateLifecycleVersionRecord[];
}

export interface TransitionTemplateVersionCommand {
  tenantId: string;
  workspaceId: string;
  templateVersionId: string;
  targetState: TemplateLifecycleState;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface CreateTemplateRevisionCommand {
  tenantId: string;
  workspaceId: string;
  sourceTemplateVersionId: string;
  templateVersionId: string;
  revisionNote: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

interface WorkspaceRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

interface TemplateVersionRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  templateId: string;
  templateName: string;
  currentVersion: number | null;
  versionNumber: number;
  lifecycleState: TemplateLifecycleState;
  contentHash: string;
  contentProvider: string;
  contentKey: string;
  createdBySubjectId: string;
  creatorName: string;
  provenance: string;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
  sourceDocumentCount: number;
}

export class TemplateLifecycleAdminService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getCatalog(
    tenantId: string,
    workspaceId: string,
  ): Promise<TemplateLifecycleCatalog> {
    const workspace = await this.loadWorkspace(tenantId, workspaceId);
    const rows = await this.loadVersions(tenantId, workspaceId);
    return {
      ...workspace,
      versions: rows.map(mapVersionRow),
    };
  }

  public async transitionVersion(
    command: TransitionTemplateVersionCommand,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const [row] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.templateVersionId],
    );
    if (!row) {
      throw new Error(
        "Template version was not found in the requested workspace.",
      );
    }

    const current = mapTemplateVersion(row);
    const next = transitionTemplateVersion(
      current,
      command.targetState,
      command.occurredAt,
    );

    await this.database.executeBatch([
      statement(
        `UPDATE template_versions
         SET lifecycle_state = ?, published_at = ?, superseded_at = ?
         WHERE id = ? AND tenant_id = ? AND template_id = ?`,
        [
          next.lifecycleState,
          next.publishedAt ?? null,
          next.supersededAt ?? null,
          next.id,
          command.tenantId,
          next.templateId,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        entityId: next.id,
        occurredAt: command.occurredAt,
        payload: {
          templateId: next.templateId,
          versionNumber: next.versionNumber,
          from: current.lifecycleState,
          to: next.lifecycleState,
          contentHash: next.contentHash,
        },
      }),
    ]);

    const [updated] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.templateVersionId],
    );
    if (!updated) {
      throw new Error("Transitioned template version could not be reloaded.");
    }
    return mapVersionRow(updated);
  }

  public async createRevision(
    command: CreateTemplateRevisionCommand,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const [source] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.sourceTemplateVersionId],
    );
    if (!source) {
      throw new Error(
        "Source template version was not found in the requested workspace.",
      );
    }

    const [openRevision] = await this.database.query<{ id: string }>(
      `SELECT version.id
       FROM template_versions version
       JOIN templates template
         ON template.id = version.template_id
        AND template.tenant_id = version.tenant_id
       WHERE version.tenant_id = ?
         AND template.workspace_id = ?
         AND version.template_id = ?
         AND version.lifecycle_state IN ('draft', 'review')
       LIMIT 1`,
      [command.tenantId, command.workspaceId, source.templateId],
    );
    if (openRevision) {
      throw new Error(
        "Complete or retire the current Draft/Review template revision before creating another.",
      );
    }

    const [sequence] = await this.database.query<{ nextVersion: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS nextVersion
       FROM template_versions
       WHERE tenant_id = ? AND template_id = ?`,
      [command.tenantId, source.templateId],
    );
    const nextVersion = Number(sequence?.nextVersion ?? 1);
    const provenance =
      `Derived from exact template version ${source.versionNumber} (${source.id}); ` +
      `content identity unchanged from ${source.contentHash}. Revision note: ${command.revisionNote}`;

    await this.database.executeBatch([
      statement(
        `INSERT INTO template_versions
           (id, tenant_id, template_id, version_number, lifecycle_state,
            content_hash, content_provider, content_key, created_by_subject_id,
            provenance, created_at, published_at, superseded_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          command.templateVersionId,
          command.tenantId,
          source.templateId,
          nextVersion,
          source.contentHash,
          source.contentProvider,
          source.contentKey,
          command.actorSubjectId,
          provenance,
          command.occurredAt,
        ],
      ),
      statement(
        `UPDATE templates
         SET current_version = ?
         WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
        [nextVersion, source.templateId, command.tenantId, command.workspaceId],
      ),
      revisionAuditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        entityId: command.templateVersionId,
        occurredAt: command.occurredAt,
        payload: {
          templateId: source.templateId,
          versionNumber: nextVersion,
          sourceTemplateVersionId: source.id,
          sourceVersionNumber: source.versionNumber,
          contentHash: source.contentHash,
          contentIdentityReused: true,
          revisionNote: command.revisionNote,
        },
      }),
    ]);

    const [created] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.templateVersionId],
    );
    if (!created) {
      throw new Error("Created template revision could not be reloaded.");
    }
    return mapVersionRow(created);
  }

  private async loadWorkspace(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceRow> {
    const [workspace] = await this.database.query<WorkspaceRow>(
      `SELECT tenant.id AS tenantId,
              tenant.name AS tenantName,
              workspace.id AS workspaceId,
              workspace.name AS workspaceName
       FROM workspaces workspace
       JOIN tenants tenant ON tenant.id = workspace.tenant_id
       WHERE workspace.tenant_id = ? AND workspace.id = ?`,
      [tenantId, workspaceId],
    );
    if (!workspace) {
      throw new Error("Template administration workspace was not found.");
    }
    return workspace;
  }

  private async loadVersions(
    tenantId: string,
    workspaceId: string,
  ): Promise<readonly TemplateVersionRow[]> {
    return this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ? AND template.workspace_id = ?
         ORDER BY template.name ASC, template.id ASC, version.version_number DESC`,
      ),
      [tenantId, workspaceId],
    );
  }
}

function templateVersionSelect(whereAndOrder: string): string {
  const orderMarker = "ORDER BY";
  const orderIndex = whereAndOrder.indexOf(orderMarker);
  const whereClause =
    orderIndex >= 0
      ? whereAndOrder.slice(0, orderIndex).trimEnd()
      : whereAndOrder.trimEnd();
  const orderClause =
    orderIndex >= 0 ? whereAndOrder.slice(orderIndex).trim() : "";

  return `SELECT version.id,
                 version.tenant_id AS tenantId,
                 template.workspace_id AS workspaceId,
                 version.template_id AS templateId,
                 template.name AS templateName,
                 template.current_version AS currentVersion,
                 version.version_number AS versionNumber,
                 version.lifecycle_state AS lifecycleState,
                 version.content_hash AS contentHash,
                 version.content_provider AS contentProvider,
                 version.content_key AS contentKey,
                 version.created_by_subject_id AS createdBySubjectId,
                 creator.display_name AS creatorName,
                 version.provenance,
                 version.created_at AS createdAt,
                 version.published_at AS publishedAt,
                 version.superseded_at AS supersededAt,
                 COUNT(document.id) AS sourceDocumentCount
          FROM template_versions version
          JOIN templates template
            ON template.id = version.template_id
           AND template.tenant_id = version.tenant_id
          JOIN identity_subjects creator
            ON creator.id = version.created_by_subject_id
          LEFT JOIN documents document
            ON document.tenant_id = version.tenant_id
           AND document.source_template_id = version.template_id
           AND document.source_template_version = version.version_number
           AND document.source_template_hash = version.content_hash
          ${whereClause}
          GROUP BY version.id, version.tenant_id, template.workspace_id,
                   version.template_id, template.name, template.current_version,
                   version.version_number, version.lifecycle_state, version.content_hash,
                   version.content_provider, version.content_key, version.created_by_subject_id,
                   creator.display_name, version.provenance, version.created_at,
                   version.published_at, version.superseded_at
          ${orderClause}`;
}

function mapVersionRow(
  row: TemplateVersionRow,
): TemplateLifecycleVersionRecord {
  const version = mapTemplateVersion(row);
  return {
    ...version,
    templateName: row.templateName,
    workspaceId: row.workspaceId,
    creatorName: row.creatorName,
    isCurrent: row.currentVersion === row.versionNumber,
    sourceDocumentCount: Number(row.sourceDocumentCount),
    availableTransitions: availableTemplateTransitions(version.lifecycleState),
  };
}

function mapTemplateVersion(row: TemplateVersionRow): TemplateVersion {
  return {
    id: row.id,
    tenantId: row.tenantId,
    templateId: row.templateId,
    versionNumber: row.versionNumber,
    lifecycleState: row.lifecycleState,
    contentHash: row.contentHash,
    contentProvider: row.contentProvider,
    contentKey: row.contentKey,
    createdBySubjectId: row.createdBySubjectId,
    provenance: row.provenance,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt ?? undefined,
    supersededAt: row.supersededAt ?? undefined,
  };
}

function statement(
  sql: string,
  parameters: readonly unknown[],
): DatabaseStatement {
  return { sql, parameters };
}

function auditStatement(input: {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}): DatabaseStatement {
  return {
    sql: `INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_subject_id, event_type,
             entity_type, entity_id, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, 'template.version.lifecycle_transitioned',
                  'template_version', ?, ?, ?)`,
    parameters: [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  };
}

function revisionAuditStatement(input: {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}): DatabaseStatement {
  return {
    sql: `INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_subject_id, event_type,
             entity_type, entity_id, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, 'template.version.created',
                  'template_version', ?, ?, ?)`,
    parameters: [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  };
}
