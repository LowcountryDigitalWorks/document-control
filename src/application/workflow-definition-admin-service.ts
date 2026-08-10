import { assertValidWorkflowDefinition } from "../domain/workflow";
import type { WorkflowDefinition } from "../domain/models";
import type { WorkflowDefinitionInput } from "./workflow-definition-input";
import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface WorkflowDefinitionRecord extends WorkflowDefinition {
  createdAt: string;
  instanceCount: number;
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

interface CatalogRow {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  definitionJson: string;
  createdAt: string;
  instanceCount: number;
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
      `SELECT definition.id,
              definition.tenant_id AS tenantId,
              definition.name,
              definition.version,
              definition.definition_json AS definitionJson,
              definition.created_at AS createdAt,
              COUNT(instance.id) AS instanceCount
       FROM workflow_definitions definition
       LEFT JOIN workflow_instances instance
         ON instance.tenant_id = definition.tenant_id
        AND instance.workflow_definition_id = definition.id
        AND instance.workflow_definition_version = definition.version
       WHERE definition.tenant_id = ?
       GROUP BY definition.id, definition.tenant_id, definition.name,
                definition.version, definition.definition_json, definition.created_at
       ORDER BY definition.name ASC, definition.id ASC, definition.version DESC`,
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
        },
      }),
    ]);

    return { ...definition, createdAt: command.occurredAt, instanceCount: 0 };
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
        },
      }),
    ]);

    return { ...definition, createdAt: command.occurredAt, instanceCount: 0 };
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

function mapCatalogRow(row: CatalogRow): WorkflowDefinitionRecord {
  const parsed: unknown = JSON.parse(row.definitionJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow definition JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.states) || !Array.isArray(record.transitions)) {
    throw new Error("Workflow definition JSON is missing states or transitions.");
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
  const definition: WorkflowDefinitionRecord = {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    version: row.version,
    states,
    transitions,
    createdAt: row.createdAt,
    instanceCount: Number(row.instanceCount),
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
