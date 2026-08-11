import type { DatabaseProvider, DatabaseStatement } from "./ports";

export const customWorkspaceRolePermissions = [
  "template.read",
  "template.use",
  "template.manage",
  "document.read",
  "document.create",
  "document.version.create",
  "document.review",
  "document.approve",
  "workflow.execute",
  "workflow.manage",
  "audit.read",
  "export.create",
] as const;

export type CustomWorkspaceRolePermission =
  (typeof customWorkspaceRolePermissions)[number];

export interface AccessRoleDefinition {
  id: string;
  key: string;
  name: string;
  permissions: readonly string[];
  isSystem: boolean;
  assignmentCount: number;
  assignedMembers: readonly string[];
  retiredAt?: string;
}

export interface AccessMember {
  subjectId: string;
  displayName: string;
  email?: string;
  provider: string;
  membershipStatus: string;
}

export interface AccessRoleBinding {
  id: string;
  subjectId: string;
  subjectName: string;
  roleDefinitionId: string;
  roleName: string;
  roleKey: string;
  createdAt: string;
}

export interface WorkspaceAccessSnapshot {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
  roles: readonly AccessRoleDefinition[];
  members: readonly AccessMember[];
  bindings: readonly AccessRoleBinding[];
}

export interface AssignWorkspaceRoleCommand {
  tenantId: string;
  workspaceId: string;
  subjectId: string;
  roleDefinitionId: string;
  bindingId: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface RemoveWorkspaceRoleCommand {
  tenantId: string;
  workspaceId: string;
  bindingId: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface CreateCustomWorkspaceRoleCommand {
  tenantId: string;
  workspaceId: string;
  roleDefinitionId: string;
  roleKey: string;
  name: string;
  permissions: readonly string[];
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface UpdateCustomWorkspaceRoleCommand {
  tenantId: string;
  workspaceId: string;
  roleDefinitionId: string;
  name: string;
  permissions: readonly string[];
  acknowledgeAssignments: boolean;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface RetireCustomWorkspaceRoleCommand {
  tenantId: string;
  workspaceId: string;
  roleDefinitionId: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface AccessMutationResult {
  changed: boolean;
  snapshot: WorkspaceAccessSnapshot;
}

interface WorkspaceRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

interface RoleRow {
  id: string;
  roleKey: string;
  name: string;
  permissionsJson: string;
  isSystem: number;
  retiredAt: string | null;
}

interface MemberRow {
  subjectId: string;
  displayName: string;
  email: string | null;
  provider: string;
  membershipStatus: string;
}

interface BindingRow {
  id: string;
  subjectId: string;
  subjectName: string;
  roleDefinitionId: string;
  roleName: string;
  roleKey: string;
  permissionsJson: string;
  createdAt: string;
}

interface RoleImpactRow {
  roleDefinitionId: string;
  subjectName: string;
  workspaceName: string;
}

export class RolesAccessAdminService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getWorkspaceAccess(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccessSnapshot> {
    const workspace = await this.loadWorkspace(tenantId, workspaceId);
    const [roleRows, memberRows, bindingRows, impactRows] = await Promise.all([
      this.database.query<RoleRow>(
        `SELECT role.id,
                role.role_key AS roleKey,
                role.name,
                role.permissions_json AS permissionsJson,
                role.is_system AS isSystem,
                role.retired_at AS retiredAt
         FROM role_definitions role
         WHERE role.scope = 'workspace'
           AND (role.tenant_id IS NULL OR role.tenant_id = ?)
         ORDER BY role.is_system DESC, role.name ASC, role.id ASC`,
        [tenantId],
      ),
      this.database.query<MemberRow>(
        `SELECT subject.id AS subjectId,
                subject.display_name AS displayName,
                subject.email,
                subject.provider,
                membership.status AS membershipStatus
         FROM tenant_memberships membership
         JOIN identity_subjects subject ON subject.id = membership.subject_id
         WHERE membership.tenant_id = ?
         ORDER BY subject.display_name ASC, subject.id ASC`,
        [tenantId],
      ),
      this.database.query<BindingRow>(
        `SELECT binding.id,
                binding.subject_id AS subjectId,
                subject.display_name AS subjectName,
                binding.role_definition_id AS roleDefinitionId,
                role.name AS roleName,
                role.role_key AS roleKey,
                role.permissions_json AS permissionsJson,
                binding.created_at AS createdAt
         FROM role_bindings binding
         JOIN role_definitions role ON role.id = binding.role_definition_id
         JOIN identity_subjects subject ON subject.id = binding.subject_id
         WHERE binding.tenant_id = ?
           AND binding.workspace_id = ?
           AND role.scope = 'workspace'
           AND (role.tenant_id IS NULL OR role.tenant_id = ?)
         ORDER BY subject.display_name ASC, role.name ASC, binding.id ASC`,
        [tenantId, workspaceId, tenantId],
      ),
      this.database.query<RoleImpactRow>(
        `SELECT binding.role_definition_id AS roleDefinitionId,
                subject.display_name AS subjectName,
                workspace.name AS workspaceName
         FROM role_bindings binding
         JOIN role_definitions role ON role.id = binding.role_definition_id
         JOIN identity_subjects subject ON subject.id = binding.subject_id
         JOIN workspaces workspace
           ON workspace.id = binding.workspace_id
          AND workspace.tenant_id = binding.tenant_id
         WHERE binding.tenant_id = ?
           AND role.scope = 'workspace'
           AND role.tenant_id = ?
         ORDER BY role.name ASC, workspace.name ASC, subject.display_name ASC`,
        [tenantId, tenantId],
      ),
    ]);

    const bindings = bindingRows.map((binding) => ({
      id: binding.id,
      subjectId: binding.subjectId,
      subjectName: binding.subjectName,
      roleDefinitionId: binding.roleDefinitionId,
      roleName: binding.roleName,
      roleKey: binding.roleKey,
      createdAt: binding.createdAt,
    }));

    return {
      ...workspace,
      roles: roleRows.map((role) => {
        const impacts = impactRows.filter(
          (impact) => impact.roleDefinitionId === role.id,
        );
        return {
          id: role.id,
          key: role.roleKey,
          name: role.name,
          permissions: parsePermissionList(role.permissionsJson),
          isSystem: role.isSystem === 1,
          assignmentCount: impacts.length,
          assignedMembers: impacts.map(
            (impact) => `${impact.subjectName} — ${impact.workspaceName}`,
          ),
          retiredAt: role.retiredAt ?? undefined,
        };
      }),
      members: memberRows.map((member) => ({
        subjectId: member.subjectId,
        displayName: member.displayName,
        email: member.email ?? undefined,
        provider: member.provider,
        membershipStatus: member.membershipStatus,
      })),
      bindings,
    };
  }

  public async createCustomWorkspaceRole(
    command: CreateCustomWorkspaceRoleCommand,
  ): Promise<AccessMutationResult> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const name = normalizeRoleName(command.name);
    const permissions = normalizeCustomPermissions(command.permissions);
    await this.assertCustomRoleNameAvailable(command.tenantId, name);

    await this.database.executeBatch([
      statement(
        `INSERT INTO role_definitions
           (id, tenant_id, role_key, name, scope, permissions_json, is_system, created_at)
         VALUES (?, ?, ?, ?, 'workspace', ?, 0, ?)`,
        [
          command.roleDefinitionId,
          command.tenantId,
          command.roleKey,
          name,
          JSON.stringify(permissions),
          command.occurredAt,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "role.definition.created",
        entityType: "role_definition",
        entityId: command.roleDefinitionId,
        occurredAt: command.occurredAt,
        payload: {
          roleKey: command.roleKey,
          name,
          permissions: JSON.stringify(permissions),
          scope: "workspace",
        },
      }),
    ]);

    return {
      changed: true,
      snapshot: await this.getWorkspaceAccess(
        command.tenantId,
        command.workspaceId,
      ),
    };
  }

  public async updateCustomWorkspaceRole(
    command: UpdateCustomWorkspaceRoleCommand,
  ): Promise<AccessMutationResult> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const current = await this.loadCustomWorkspaceRole(
      command.tenantId,
      command.roleDefinitionId,
    );
    if (current.retiredAt) {
      throw new Error("Retired custom roles cannot be edited.");
    }
    const name = normalizeRoleName(command.name);
    const permissions = normalizeCustomPermissions(command.permissions);
    await this.assertCustomRoleNameAvailable(
      command.tenantId,
      name,
      command.roleDefinitionId,
    );

    const impacts = await this.database.query<RoleImpactRow>(
      `SELECT binding.role_definition_id AS roleDefinitionId,
              subject.display_name AS subjectName,
              workspace.name AS workspaceName
       FROM role_bindings binding
       JOIN identity_subjects subject ON subject.id = binding.subject_id
       JOIN workspaces workspace
         ON workspace.id = binding.workspace_id
        AND workspace.tenant_id = binding.tenant_id
       WHERE binding.tenant_id = ? AND binding.role_definition_id = ?`,
      [command.tenantId, command.roleDefinitionId],
    );
    if (impacts.length > 0 && !command.acknowledgeAssignments) {
      throw new Error(
        `This role currently affects ${impacts.length} assignment${impacts.length === 1 ? "" : "s"}. Acknowledge the impact before changing it.`,
      );
    }

    const currentPermissions = parsePermissionList(current.permissionsJson);
    if (
      current.name === name &&
      JSON.stringify(currentPermissions) === JSON.stringify(permissions)
    ) {
      return {
        changed: false,
        snapshot: await this.getWorkspaceAccess(
          command.tenantId,
          command.workspaceId,
        ),
      };
    }

    await this.database.executeBatch([
      statement(
        `UPDATE role_definitions
         SET name = ?, permissions_json = ?
         WHERE id = ? AND tenant_id = ? AND scope = 'workspace' AND is_system = 0`,
        [
          name,
          JSON.stringify(permissions),
          command.roleDefinitionId,
          command.tenantId,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "role.definition.updated",
        entityType: "role_definition",
        entityId: command.roleDefinitionId,
        occurredAt: command.occurredAt,
        payload: {
          roleKey: current.roleKey,
          previousName: current.name,
          name,
          previousPermissions: JSON.stringify(currentPermissions),
          permissions: JSON.stringify(permissions),
          assignmentCount: String(impacts.length),
        },
      }),
    ]);

    return {
      changed: true,
      snapshot: await this.getWorkspaceAccess(
        command.tenantId,
        command.workspaceId,
      ),
    };
  }

  public async retireCustomWorkspaceRole(
    command: RetireCustomWorkspaceRoleCommand,
  ): Promise<AccessMutationResult> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const current = await this.loadCustomWorkspaceRole(
      command.tenantId,
      command.roleDefinitionId,
    );
    if (current.retiredAt) {
      return {
        changed: false,
        snapshot: await this.getWorkspaceAccess(
          command.tenantId,
          command.workspaceId,
        ),
      };
    }

    const [impact] = await this.database.query<{ assignmentCount: number }>(
      `SELECT COUNT(*) AS assignmentCount
       FROM role_bindings
       WHERE role_definition_id = ? AND tenant_id = ?`,
      [command.roleDefinitionId, command.tenantId],
    );
    const assignmentCount = Number(impact?.assignmentCount ?? 0);
    if (assignmentCount > 0) {
      throw new Error(
        `Remove all ${assignmentCount} current assignment${assignmentCount === 1 ? "" : "s"} before retiring this custom role.`,
      );
    }

    await this.database.executeBatch([
      statement(
        `UPDATE role_definitions
         SET retired_at = ?
         WHERE id = ? AND tenant_id = ? AND scope = 'workspace' AND is_system = 0`,
        [command.occurredAt, command.roleDefinitionId, command.tenantId],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "role.definition.retired",
        entityType: "role_definition",
        entityId: command.roleDefinitionId,
        occurredAt: command.occurredAt,
        payload: {
          roleKey: current.roleKey,
          name: current.name,
          permissions: JSON.stringify(
            parsePermissionList(current.permissionsJson),
          ),
          retirement: "terminal",
        },
      }),
    ]);

    return {
      changed: true,
      snapshot: await this.getWorkspaceAccess(
        command.tenantId,
        command.workspaceId,
      ),
    };
  }

  public async assignWorkspaceRole(
    command: AssignWorkspaceRoleCommand,
  ): Promise<AccessMutationResult> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const member = await this.loadActiveMember(
      command.tenantId,
      command.subjectId,
    );
    const role = await this.loadEligibleWorkspaceRole(
      command.tenantId,
      command.roleDefinitionId,
    );

    const [existing] = await this.database.query<{ id: string }>(
      `SELECT binding.id
       FROM role_bindings binding
       WHERE binding.role_definition_id = ?
         AND binding.subject_id = ?
         AND binding.tenant_id = ?
         AND binding.workspace_id = ?
       LIMIT 1`,
      [role.id, member.subjectId, command.tenantId, command.workspaceId],
    );
    if (existing) {
      return {
        changed: false,
        snapshot: await this.getWorkspaceAccess(
          command.tenantId,
          command.workspaceId,
        ),
      };
    }

    await this.database.executeBatch([
      statement(
        `INSERT INTO role_bindings
           (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          command.bindingId,
          role.id,
          member.subjectId,
          command.tenantId,
          command.workspaceId,
          command.occurredAt,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "role.binding.created",
        entityType: "role_binding",
        entityId: command.bindingId,
        occurredAt: command.occurredAt,
        payload: {
          subjectId: member.subjectId,
          roleDefinitionId: role.id,
          roleKey: role.roleKey,
        },
      }),
    ]);

    return {
      changed: true,
      snapshot: await this.getWorkspaceAccess(
        command.tenantId,
        command.workspaceId,
      ),
    };
  }

  public async removeWorkspaceRole(
    command: RemoveWorkspaceRoleCommand,
  ): Promise<AccessMutationResult> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const [binding] = await this.database.query<BindingRow>(
      `SELECT binding.id,
              binding.subject_id AS subjectId,
              subject.display_name AS subjectName,
              binding.role_definition_id AS roleDefinitionId,
              role.name AS roleName,
              role.role_key AS roleKey,
              role.permissions_json AS permissionsJson,
              binding.created_at AS createdAt
       FROM role_bindings binding
       JOIN role_definitions role ON role.id = binding.role_definition_id
       JOIN identity_subjects subject ON subject.id = binding.subject_id
       WHERE binding.id = ?
         AND binding.tenant_id = ?
         AND binding.workspace_id = ?
         AND role.scope = 'workspace'
         AND (role.tenant_id IS NULL OR role.tenant_id = ?)`,
      [
        command.bindingId,
        command.tenantId,
        command.workspaceId,
        command.tenantId,
      ],
    );
    if (!binding) {
      return {
        changed: false,
        snapshot: await this.getWorkspaceAccess(
          command.tenantId,
          command.workspaceId,
        ),
      };
    }

    const permissions = parsePermissionList(binding.permissionsJson);
    if (
      binding.subjectId === command.actorSubjectId &&
      (permissions.includes("role.manage") || permissions.includes("*"))
    ) {
      throw new Error(
        "The acting administrator cannot remove their own role-management grant from this screen.",
      );
    }

    await this.database.executeBatch([
      statement(
        `DELETE FROM role_bindings
         WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
        [command.bindingId, command.tenantId, command.workspaceId],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "role.binding.removed",
        entityType: "role_binding",
        entityId: command.bindingId,
        occurredAt: command.occurredAt,
        payload: {
          subjectId: binding.subjectId,
          roleDefinitionId: binding.roleDefinitionId,
          roleKey: binding.roleKey,
        },
      }),
    ]);

    return {
      changed: true,
      snapshot: await this.getWorkspaceAccess(
        command.tenantId,
        command.workspaceId,
      ),
    };
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
      throw new Error("Workspace access administration target was not found.");
    }
    return workspace;
  }

  private async loadActiveMember(
    tenantId: string,
    subjectId: string,
  ): Promise<{ subjectId: string }> {
    const [member] = await this.database.query<{ subjectId: string }>(
      `SELECT subject_id AS subjectId
       FROM tenant_memberships
       WHERE tenant_id = ? AND subject_id = ? AND status = 'active'`,
      [tenantId, subjectId],
    );
    if (!member) {
      throw new Error(
        "Workspace roles can only be assigned to an active member of this tenant.",
      );
    }
    return member;
  }

  private async loadEligibleWorkspaceRole(
    tenantId: string,
    roleDefinitionId: string,
  ): Promise<RoleRow> {
    const [role] = await this.database.query<RoleRow>(
      `SELECT id,
              role_key AS roleKey,
              name,
              permissions_json AS permissionsJson,
              is_system AS isSystem,
              retired_at AS retiredAt
       FROM role_definitions
       WHERE id = ?
         AND scope = 'workspace'
         AND retired_at IS NULL
         AND (tenant_id IS NULL OR tenant_id = ?)`,
      [roleDefinitionId, tenantId],
    );
    if (!role) {
      throw new Error(
        "Only a workspace-scoped role available to this tenant can be assigned here.",
      );
    }
    return role;
  }

  private async loadCustomWorkspaceRole(
    tenantId: string,
    roleDefinitionId: string,
  ): Promise<RoleRow> {
    const [role] = await this.database.query<RoleRow>(
      `SELECT id,
              role_key AS roleKey,
              name,
              permissions_json AS permissionsJson,
              is_system AS isSystem,
              retired_at AS retiredAt
       FROM role_definitions
       WHERE id = ?
         AND tenant_id = ?
         AND scope = 'workspace'
         AND is_system = 0`,
      [roleDefinitionId, tenantId],
    );
    if (!role) {
      throw new Error(
        "Only a tenant-defined workspace role can be edited from this screen.",
      );
    }
    return role;
  }

  private async assertCustomRoleNameAvailable(
    tenantId: string,
    name: string,
    excludingRoleDefinitionId?: string,
  ): Promise<void> {
    const parameters: unknown[] = [tenantId, name];
    let exclusion = "";
    if (excludingRoleDefinitionId) {
      exclusion = " AND id <> ?";
      parameters.push(excludingRoleDefinitionId);
    }
    const [existing] = await this.database.query<{ id: string }>(
      `SELECT id FROM role_definitions
       WHERE tenant_id = ?
         AND scope = 'workspace'
         AND lower(name) = lower(?)${exclusion}
       LIMIT 1`,
      parameters,
    );
    if (existing) {
      throw new Error("A custom workspace role with this name already exists.");
    }
  }
}

function normalizeRoleName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 80) {
    throw new Error("Custom role name must contain 2 to 80 characters.");
  }
  if (/\p{C}/u.test(name)) {
    throw new Error(
      "Custom role name contains unsupported control characters.",
    );
  }
  return name;
}

function normalizeCustomPermissions(values: readonly string[]): string[] {
  const selected = new Set(values);
  if (selected.size === 0) {
    throw new Error("Select at least one permission for a custom role.");
  }
  for (const permission of selected) {
    if (
      !customWorkspaceRolePermissions.includes(
        permission as CustomWorkspaceRolePermission,
      )
    ) {
      throw new Error(
        `Permission ${permission} is not available to tenant-defined workspace roles.`,
      );
    }
  }
  return customWorkspaceRolePermissions.filter((permission) =>
    selected.has(permission),
  );
}

function parsePermissionList(serialized: string): readonly string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new Error("Role permissions must be a JSON array of strings.");
  }
  return parsed;
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
  eventType: string;
  entityType: "role_binding" | "role_definition";
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, string>>;
}): DatabaseStatement {
  return statement(
    `INSERT INTO audit_events
       (id, tenant_id, workspace_id, actor_subject_id, event_type,
        entity_type, entity_id, occurred_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.eventType,
      input.entityType,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  );
}
