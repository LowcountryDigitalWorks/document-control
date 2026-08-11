import { assertValidWorkflowDefinition } from "../domain/workflow";
import {
  availableWorkflowLifecycleTransitions,
  transitionWorkflowLifecycle,
  type WorkflowLifecycleState,
} from "../domain/workflow-lifecycle";
import type { WorkflowDefinition } from "../domain/models";
import type { WorkflowDefinitionInput } from "./workflow-definition-input";
import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface WorkflowDefinitionRecord extends WorkflowDefinition {
  createdAt: string;
  instanceCount: number;
  lifecycleState: WorkflowLifecycleState;
  lifecycleChangedAt: string;
  lifecycleChangedBySubjectId?: string;
  workspaceAssignmentCount: number;
  availableLifecycleTransitions: readonly WorkflowLifecycleState[];
}

export interface WorkflowDefinitionCatalog {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
  definitions: readonly WorkflowDefinitionRecord[];
}

export interface CreateWorkflowDefinitionCommand {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
  input: WorkflowDefinitionInput;
}

export interface CreateWorkflowDefinitionVersionCommand {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
  input: WorkflowDefinitionInput;
}

export interface TransitionWorkflowDefinitionLifecycleCommand {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  targetState: WorkflowLifecycleState;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

interface CatalogRow {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  definitionJson: string;
  createdAt: string;
  instanceCount: number;
  lifecycleState: WorkflowLifecycleState;
  lifecycleChangedAt: string;
  lifecycleChangedBySubjectId: string | null;
  workspaceAssignmentCount: number;
}

interface WorkspaceRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

export class WorkflowDefinitionAdminService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getCatalog(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkflowDefinitionCatalog> {
    const workspace = await this.loadWorkspace(tenantId, workspaceId);
    const rows = await this.database.query<CatalogRow>(
      definitionSelect(
        `WHERE definition.tenant_id = ?
         ORDER BY definition.id ASC, definition.version DESC`,
      ),
      [tenantId],
    );

    return {
      ...workspace,
      definitions: rows.map(mapCatalogRow),
    };
  }

  public async createDefinition(
    command: CreateWorkflowDefinitionCommand,
  ): Promise<WorkflowDefinitionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const definition: WorkflowDefinition = {
      id: command.workflowDefinitionId,
      tenantId: command.tenantId,
      name: command.input.name,
      version: 1,
      states: [...command.input.states],
      transitions: [...command.input.transitions],
    };
    assertValidWorkflowDefinition(definition);

    const [existing] = await this.database.query<{ id: string }>(
      "SELECT id FROM workflow_definitions WHERE id = ? LIMIT 1",
      [definition.id],
    );
    if (existing) {
      throw new Error("Workflow definition identifier is already in use.");
    }

    await this.database.executeBatch([
      insertDefinitionStatement(definition, command.occurredAt),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.definition.created",
        entityId: definition.id,
        occurredAt: command.occurredAt,
        payload: {
          version: definition.version,
          name: definition.name,
          stateCount: definition.states.length,
          transitionCount: definition.transitions.length,
          lifecycleState: "active",
        },
      }),
    ]);

    return this.loadDefinitionRecord(
      command.tenantId,
      definition.id,
      definition.version,
    );
  }

  public async createVersion(
    command: CreateWorkflowDefinitionVersionCommand,
  ): Promise<WorkflowDefinitionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const [family] = await this.database.query<{ nextVersion: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion
       FROM workflow_definitions
       WHERE tenant_id = ? AND id = ?`,
      [command.tenantId, command.workflowDefinitionId],
    );
    const nextVersion = family?.nextVersion ?? 1;
    if (nextVersion === 1) {
      throw new Error(
        "The requested workflow definition does not exist in this tenant.",
      );
    }

    const definition: WorkflowDefinition = {
      id: command.workflowDefinitionId,
      tenantId: command.tenantId,
      name: command.input.name,
      version: nextVersion,
      states: [...command.input.states],
      transitions: [...command.input.transitions],
    };
    assertValidWorkflowDefinition(definition);

    await this.database.executeBatch([
      insertDefinitionStatement(definition, command.occurredAt),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.definition.version_created",
        entityId: definition.id,
        occurredAt: command.occurredAt,
        payload: {
          version: definition.version,
          name: definition.name,
          stateCount: definition.states.length,
          transitionCount: definition.transitions.length,
          lifecycleState: "active",
        },
      }),
    ]);

    return this.loadDefinitionRecord(
      command.tenantId,
      definition.id,
      definition.version,
    );
  }

  public async transitionLifecycle(
    command: TransitionWorkflowDefinitionLifecycleCommand,
  ): Promise<WorkflowDefinitionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const current = await this.loadDefinitionRecord(
      command.tenantId,
      command.workflowDefinitionId,
      command.workflowDefinitionVersion,
    );
    const nextState = transitionWorkflowLifecycle(
      current.lifecycleState,
      command.targetState,
    );
    if (nextState === "retired" && current.workspaceAssignmentCount > 0) {
      throw new Error(
        "Remove this workflow version from every workspace before retiring it.",
      );
    }

    await this.database.executeBatch([
      {
        sql: `UPDATE workflow_definition_lifecycle
              SET lifecycle_state = ?,
                  changed_by_subject_id = ?,
                  changed_at = ?
              WHERE tenant_id = ?
                AND workflow_definition_id = ?
                AND workflow_definition_version = ?`,
        parameters: [
          nextState,
          command.actorSubjectId,
          command.occurredAt,
          command.tenantId,
          command.workflowDefinitionId,
          command.workflowDefinitionVersion,
        ],
      },
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "workflow.definition.lifecycle_transitioned",
        entityId: `${command.workflowDefinitionId}@${command.workflowDefinitionVersion}`,
        occurredAt: command.occurredAt,
        payload: {
          workflowDefinitionId: command.workflowDefinitionId,
          workflowDefinitionVersion: command.workflowDefinitionVersion,
          from: current.lifecycleState,
          to: nextState,
          workspaceAssignmentCount: current.workspaceAssignmentCount,
          instanceCount: current.instanceCount,
        },
      }),
    ]);

    return this.loadDefinitionRecord(
      command.tenantId,
      command.workflowDefinitionId,
      command.workflowDefinitionVersion,
    );
  }

  private async loadDefinitionRecord(
    tenantId: string,
    workflowDefinitionId: string,
    workflowDefinitionVersion: number,
  ): Promise<WorkflowDefinitionRecord> {
    const [row] = await this.database.query<CatalogRow>(
      definitionSelect(
        `WHERE definition.tenant_id = ?
           AND definition.id = ?
           AND definition.version = ?`,
      ),
      [tenantId, workflowDefinitionId, workflowDefinitionVersion],
    );
    if (!row) {
      throw new Error(
        "The requested workflow definition version does not exist in this tenant.",
      );
    }
    return mapCatalogRow(row);
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
      throw new Error("Workflow administration workspace was not found.");
    }
    return workspace;
  }
}

function definitionSelect(whereAndOrder: string): string {
  const orderMarker = "ORDER BY";
  const orderIndex = whereAndOrder.indexOf(orderMarker);
  const whereClause =
    orderIndex >= 0
      ? whereAndOrder.slice(0, orderIndex).trimEnd()
      : whereAndOrder.trimEnd();
  const orderClause =
    orderIndex >= 0 ? whereAndOrder.slice(orderIndex).trim() : "";

  return `SELECT definition.id,
                 definition.tenant_id AS tenantId,
                 definition.name,
                 definition.version,
                 definition.definition_json AS definitionJson,
                 definition.created_at AS createdAt,
                 lifecycle.lifecycle_state AS lifecycleState,
                 lifecycle.changed_at AS lifecycleChangedAt,
                 lifecycle.changed_by_subject_id AS lifecycleChangedBySubjectId,
                 COUNT(DISTINCT instance.id) AS instanceCount,
                 COUNT(DISTINCT assignment.workspace_id) AS workspaceAssignmentCount
          FROM workflow_definitions definition
          JOIN workflow_definition_lifecycle lifecycle
            ON lifecycle.tenant_id = definition.tenant_id
           AND lifecycle.workflow_definition_id = definition.id
           AND lifecycle.workflow_definition_version = definition.version
          LEFT JOIN workflow_instances instance
            ON instance.tenant_id = definition.tenant_id
           AND instance.workflow_definition_id = definition.id
           AND instance.workflow_definition_version = definition.version
          LEFT JOIN workspace_workflow_assignments assignment
            ON assignment.tenant_id = definition.tenant_id
           AND assignment.workflow_definition_id = definition.id
           AND assignment.workflow_definition_version = definition.version
          ${whereClause}
          GROUP BY definition.id, definition.tenant_id, definition.name,
                   definition.version, definition.definition_json, definition.created_at,
                   lifecycle.lifecycle_state, lifecycle.changed_at,
                   lifecycle.changed_by_subject_id
          ${orderClause}`;
}

function mapCatalogRow(row: CatalogRow): WorkflowDefinitionRecord {
  const parsed: unknown = JSON.parse(row.definitionJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow definition JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.states) || !Array.isArray(record.transitions)) {
    throw new Error(
      "Workflow definition JSON is missing states or transitions.",
    );
  }
  const states = record.states.map((state) => {
    if (typeof state !== "string") {
      throw new Error("Workflow states must be strings.");
    }
    return state;
  });
  const transitions = record.transitions.map((transition) => {
    if (
      typeof transition !== "object" ||
      transition === null ||
      Array.isArray(transition)
    ) {
      throw new Error("Workflow transitions must be objects.");
    }
    const candidate = transition as Record<string, unknown>;
    if (
      typeof candidate.from !== "string" ||
      typeof candidate.to !== "string"
    ) {
      throw new Error("Workflow transitions require string from/to states.");
    }
    return { from: candidate.from, to: candidate.to };
  });
  const workspaceAssignmentCount = Number(row.workspaceAssignmentCount);
  const definition: WorkflowDefinitionRecord = {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    version: Number(row.version),
    states,
    transitions,
    createdAt: row.createdAt,
    instanceCount: Number(row.instanceCount),
    lifecycleState: row.lifecycleState,
    lifecycleChangedAt: row.lifecycleChangedAt,
    lifecycleChangedBySubjectId: row.lifecycleChangedBySubjectId ?? undefined,
    workspaceAssignmentCount,
    availableLifecycleTransitions: availableWorkflowLifecycleTransitions(
      row.lifecycleState,
    ).filter(
      (target) => target !== "retired" || workspaceAssignmentCount === 0,
    ),
  };
  assertValidWorkflowDefinition(definition);
  return definition;
}

function insertDefinitionStatement(
  definition: WorkflowDefinition,
  createdAt: string,
): DatabaseStatement {
  return {
    sql: `INSERT INTO workflow_definitions
            (id, tenant_id, name, version, definition_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    parameters: [
      definition.id,
      definition.tenantId,
      definition.name,
      definition.version,
      JSON.stringify({
        states: definition.states,
        transitions: definition.transitions,
      }),
      createdAt,
    ],
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
          VALUES (?, ?, ?, ?, ?, 'workflow_definition', ?, ?, ?)`,
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
