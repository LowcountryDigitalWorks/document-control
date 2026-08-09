import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const tenantColumns = {
  tenantId: text("tenant_id").notNull(),
};

export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("tenants_slug_unique").on(table.slug)],
);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const roleAssignments = sqliteTable(
  "role_assignments",
  {
    id: text("id").primaryKey(),
    ...tenantColumns,
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("role_assignments_scope_actor_role_unique").on(
      table.workspaceId,
      table.actorId,
      table.role,
    ),
  ],
);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  currentVersionId: text("current_version_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    ...tenantColumns,
    documentId: text("document_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    contentHash: text("content_hash").notNull(),
    contentKey: text("content_key").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("document_versions_number_unique").on(
      table.documentId,
      table.versionNumber,
    ),
  ],
);

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  documentId: text("document_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  contentHash: text("content_hash").notNull(),
  actorId: text("actor_id").notNull(),
  workflowDefinitionId: text("workflow_definition_id").notNull(),
  workflowDefinitionVersion: integer("workflow_definition_version").notNull(),
  approvedAt: text("approved_at").notNull(),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  currentVersion: integer("current_version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workflowDefinitions = sqliteTable(
  "workflow_definitions",
  {
    id: text("id").notNull(),
    ...tenantColumns,
    name: text("name").notNull(),
    version: integer("version").notNull(),
    definitionJson: text("definition_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_definitions_id_version_unique").on(
      table.id,
      table.version,
    ),
  ],
);

export const workflowInstances = sqliteTable("workflow_instances", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  documentId: text("document_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  workflowDefinitionId: text("workflow_definition_id").notNull(),
  workflowDefinitionVersion: integer("workflow_definition_version").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  workflowInstanceId: text("workflow_instance_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  actorId: text("actor_id").notNull(),
  decision: text("decision").notNull(),
  comment: text("comment"),
  createdAt: text("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  ...tenantColumns,
  workspaceId: text("workspace_id").notNull(),
  actorId: text("actor_id").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull(),
});
