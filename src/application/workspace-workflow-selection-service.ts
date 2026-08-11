import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface WorkspaceWorkflowSelectionRecord {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  name: string;
  states: readonly string[];
  transitions: readonly { from: string; to: string }[];
  createdAt: string;
  instanceCount: number;
  applicable: boolean;
  isDefault: boolean;
}

export interface WorkspaceWorkflowSelectionCatalog {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
  definitions: readonly WorkspaceWorkflowSelectionRecord[];
}

export interface SetWorkflowApplicabilityCommand {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  applicable: boolean;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface SetDefaultWorkflowCommand {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface ResolvedWorkspaceWorkflow {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
}

interface WorkspaceRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

interface CatalogRow {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  name: string;
  definitionJson: string;
  createdAt: string;
  instanceCount: number;
  applicable: number;
  isDefault: number;
}

interface AssignmentRow {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  isDefault: number;
}

export class WorkspaceWorkflowSelectionService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getCatalog(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceWorkflowSelectionCatalog> {
    const workspace = await this.loadWorkspace(tenantId, workspaceId);
    const rows = await this.database.query<CatalogRow>(
      `SELECT definition.id AS workflowDefinitionId,
              definition.version AS workflowDefinitionVersion,
              definition.name,
              definition.definition_json AS definitionJson,
              definition.created_at AS createdAt,
              COUNT(DISTINCT instance.id) AS instanceCount,
              CASE WHEN assignment.workflow_definition_id IS NULL THEN 0 ELSE 1 END AS applicable,
              COALESCE(assignment.is_default, 0) AS isDefault
       FROM workflow_definitions definition
       LEFT JOIN workflow_instances instance
         ON instance.tenant_id = definition.tenant_id
        AND instance.workflow_definition_id = definition.id
        AND instance.workflow_definition_version = definition.version
       LEFT JOIN workspace_workflow_assignments assignment
         ON assignment.tenant_id = definition.tenant_id
        AND assignment.workspace_id = ?
        AND assignment.workflow_definition_id = definition.id
        AND assignment.workflow_definition_version = definition.version
       WHERE definition.tenant_id = ?
       GROUP BY definition.id, definition.version, definition.name,
                definition.definition_json, definition.created_at,
                assignment.workflow_definition_id, assignment.is_default
       ORDER BY definition.id ASC, definition.version DESC`,
      [workspaceId, tenantId],
    );

    return {
      ...workspace,
      definitions: rows.map(mapCatalogRow),
    };
  }

  public async setApplicability(
    command: SetWorkflowApplicabilityCommand,
  ): Promise<{ changed: boolean }> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    await this.assertDefinitionExists(
      command.tenantId,
      command.workflowDefinitionId,
      command.workflowDefinitionVersion,
    );

    const [existing] = await this.database.query<AssignmentRow>(
      `SELECT workflow_definition_id AS workflowDefinitionId,
              workflow_definition_version AS workflowDefinitionVersion,
              is_default AS isDefault
       FROM workspace_workflow_assignments
       WHERE tenant_id = ? AND workspace_id = ?
         AND workflow_definition_id = ? AND workflow_definition_version = ?`,
      [
        command.tenantId,
        command.workspaceId,
        command.workflowDefinitionId,
        command.workflowDefinitionVersion,
      ],
    );

    if (command.applicable) {
      if (existing) return { changed: false };
      await this.database.executeBatch([
        {
          sql: `INSERT INTO workspace_workflow_assignments
                  (tenant_id, workspace_id, workflow_definition_id,
                   workflow_definition_version, is_default,
                   created_by_subject_id, created_at,
                   updated_by_subject_id, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          parameters: [
            command.tenantId,
            command.workspaceId,
            command.workflowDefinitionId,
            command.workflowDefinitionVersion,
            command.actorSubjectId,
            command.occurredAt,
            command.actorSubjectId,
            command.occurredAt,
          ],
        },
        auditStatement({
          id: command.auditEventId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          actorSubjectId: command.actorSubjectId,
          eventType: "workflow.workspace_applicability.enabled",
          entityId: `${command.workflowDefinitionId}@${command.workflowDefinitionVersion}`,
          occurredAt: command.occurredAt,
          payload: {
            workflowDefinitionId: command.workflowDefinitionId,
            workflowDefinitionVersion: command.workflowDefinitionVersion,
          },
        }),
      ]);
      return { changed: true };
    }

    if (!existing) return { changed: false };
    if (existing.isDefault === 1) {
      throw new Error(
        "The workspace default workflow cannot be removed from applicability. Select another default first.",
      );
    }

    await this.database.executeBatch([
      {
        sql: `DELETE FROM workspace_workflow_assignments
              WHERE tenant_id = ? AND workspace_id = ?
                AND workflow_definition_id = ?
                AND workflow_definition_version = ?`,
        parameters: [
          command.tenantId,
          command.workspaceId,
          command.workflowDefinitionId,
          command.workflowDefinitionVersion,
        ],
      },
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.workspace_applicability.disabled",
        entityId: `${command.workflowDefinitionId}@${command.workflowDefinitionVersion}`,
        occurredAt: command.occurredAt,
        payload: {
          workflowDefinitionId: command.workflowDefinitionId,
          workflowDefinitionVersion: command.workflowDefinitionVersion,
        },
      }),
    ]);
    return { changed: true };
  }

  public async setDefault(
    command: SetDefaultWorkflowCommand,
  ): Promise<{ changed: boolean }> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    await this.assertDefinitionExists(
      command.tenantId,
      command.workflowDefinitionId,
      command.workflowDefinitionVersion,
    );

    const assignments = await this.database.query<AssignmentRow>(
      `SELECT workflow_definition_id AS workflowDefinitionId,
              workflow_definition_version AS workflowDefinitionVersion,
              is_default AS isDefault
       FROM workspace_workflow_assignments
       WHERE tenant_id = ? AND workspace_id = ?`,
      [command.tenantId, command.workspaceId],
    );
    const target = assignments.find(
      (assignment) =>
        assignment.workflowDefinitionId === command.workflowDefinitionId &&
        assignment.workflowDefinitionVersion ===
          command.workflowDefinitionVersion,
    );
    if (!target) {
      throw new Error(
        "A workflow version must be applicable to this workspace before it can be selected as the default.",
      );
    }
    if (target.isDefault === 1) return { changed: false };

    const previous = assignments.find((assignment) => assignment.isDefault === 1);
    await this.database.executeBatch([
      {
        sql: `UPDATE workspace_workflow_assignments
              SET is_default = 0,
                  updated_by_subject_id = ?,
                  updated_at = ?
              WHERE tenant_id = ? AND workspace_id = ? AND is_default = 1`,
        parameters: [
          command.actorSubjectId,
          command.occurredAt,
          command.tenantId,
          command.workspaceId,
        ],
      },
      {
        sql: `UPDATE workspace_workflow_assignments
              SET is_default = 1,
                  updated_by_subject_id = ?,
                  updated_at = ?
              WHERE tenant_id = ? AND workspace_id = ?
                AND workflow_definition_id = ?
                AND workflow_definition_version = ?`,
        parameters: [
          command.actorSubjectId,
          command.occurredAt,
          command.tenantId,
          command.workspaceId,
          command.workflowDefinitionId,
          command.workflowDefinitionVersion,
        ],
      },
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.workspace_default.changed",
        entityId: command.workspaceId,
        occurredAt: command.occurredAt,
        payload: {
          previousWorkflowDefinitionId: previous?.workflowDefinitionId ?? null,
          previousWorkflowDefinitionVersion:
            previous?.workflowDefinitionVersion ?? null,
          workflowDefinitionId: command.workflowDefinitionId,
          workflowDefinitionVersion: command.workflowDefinitionVersion,
        },
      }),
    ]);
    return { changed: true };
  }

  public async resolveDefault(
    tenantId: string,
    workspaceId: string,
  ): Promise<ResolvedWorkspaceWorkflow> {
    await this.loadWorkspace(tenantId, workspaceId);
    const [row] = await this.database.query<{
      workflowDefinitionId: string;
      workflowDefinitionVersion: number;
    }>(
      `SELECT workflow_definition_id AS workflowDefinitionId,
              workflow_definition_version AS workflowDefinitionVersion
       FROM workspace_workflow_assignments
       WHERE tenant_id = ? AND workspace_id = ? AND is_default = 1`,
      [tenantId, workspaceId],
    );
    if (!row) {
      throw new Error("No default workflow is configured for this workspace.");
    }
    return row;
  }

  private async assertDefinitionExists(
    tenantId: string,
    definitionId: string,
    version: number,
  ): Promise<void> {
    const [definition] = await this.database.query<{ id: string }>(
      `SELECT id FROM workflow_definitions
       WHERE tenant_id = ? AND id = ? AND version = ?`,
      [tenantId, definitionId, version],
    );
    if (!definition) {
      throw new Error(
        "The requested workflow definition version does not exist in this tenant.",
      );
    }
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
      throw new Error("Workflow selection workspace was not found.");
    }
    return workspace;
  }
}

function mapCatalogRow(row: CatalogRow): WorkspaceWorkflowSelectionRecord {
  const parsed: unknown = JSON.parse(row.definitionJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow definition JSON must be an object.");
  }
  const object = parsed as Record<string, unknown>;
  if (!Array.isArray(object.states) || !Array.isArray(object.transitions)) {
    throw new Error("Workflow definition JSON is missing states or transitions.");
  }
  const states = object.states.map((value) => {
    if (typeof value !== "string") throw new Error("Workflow states must be strings.");
    return value;
  });
  const transitions = object.transitions.map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Workflow transitions must be objects.");
    }
    const transition = value as Record<string, unknown>;
    if (typeof transition.from !== "string" || typeof transition.to !== "string") {
      throw new Error("Workflow transitions require string from/to states.");
    }
    return { from: transition.from, to: transition.to };
  });
  return {
    workflowDefinitionId: row.workflowDefinitionId,
    workflowDefinitionVersion: Number(row.workflowDefinitionVersion),
    name: row.name,
    states,
    transitions,
    createdAt: row.createdAt,
    instanceCount: Number(row.instanceCount),
    applicable: Number(row.applicable) === 1,
    isDefault: Number(row.isDefault) === 1,
  };
}

function auditStatement(input: {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  eventType: string;
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}): DatabaseStatement {
  return {
    sql: `INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_subject_id, event_type,
             entity_type, entity_id, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, 'workspace_workflow', ?, ?, ?)`,
    parameters: [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.eventType,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  };
}
