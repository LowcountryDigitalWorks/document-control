import type { DatabaseProvider, DatabaseStatement } from "./ports";

export type TenantMembershipStatus = "active" | "suspended" | "invited";

export interface TenantMemberRecord {
  membershipId: string;
  subjectId: string;
  displayName: string;
  email?: string;
  provider: "local" | "oidc" | "saml" | "entra" | "external";
  providerSubject?: string;
  status: TenantMembershipStatus;
  createdAt: string;
  tenantRoleBindingCount: number;
  workspaceRoleBindingCount: number;
}

export interface TenantMemberDirectory {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
  members: readonly TenantMemberRecord[];
}

export interface CreateDirectMemberCommand {
  tenantId: string;
  workspaceId: string;
  membershipId: string;
  subjectId: string;
  providerSubject: string;
  displayName: string;
  email: string;
  initialStatus: "active" | "invited";
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface TransitionMembershipCommand {
  tenantId: string;
  workspaceId: string;
  membershipId: string;
  targetStatus: "active" | "suspended";
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

interface TenantWorkspaceRow {
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

interface MemberRow {
  membershipId: string;
  subjectId: string;
  displayName: string;
  email: string | null;
  provider: TenantMemberRecord["provider"];
  providerSubject: string | null;
  status: TenantMembershipStatus;
  createdAt: string;
  tenantRoleBindingCount: number;
  workspaceRoleBindingCount: number;
}

const allowedTransitions: Readonly<
  Record<TenantMembershipStatus, readonly TenantMembershipStatus[]>
> = {
  invited: ["active", "suspended"],
  active: ["suspended"],
  suspended: ["active"],
};

export class MemberAdminService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getDirectory(
    tenantId: string,
    workspaceId: string,
  ): Promise<TenantMemberDirectory> {
    const context = await this.loadTenantWorkspace(tenantId, workspaceId);
    const rows = await this.database.query<MemberRow>(
      `SELECT membership.id AS membershipId,
              subject.id AS subjectId,
              subject.display_name AS displayName,
              subject.email,
              subject.provider,
              subject.provider_subject AS providerSubject,
              membership.status,
              membership.created_at AS createdAt,
              COUNT(DISTINCT CASE WHEN binding.workspace_id IS NULL THEN binding.id END)
                AS tenantRoleBindingCount,
              COUNT(DISTINCT CASE WHEN binding.workspace_id IS NOT NULL THEN binding.id END)
                AS workspaceRoleBindingCount
       FROM tenant_memberships membership
       JOIN identity_subjects subject ON subject.id = membership.subject_id
       LEFT JOIN role_bindings binding
         ON binding.tenant_id = membership.tenant_id
        AND binding.subject_id = membership.subject_id
       WHERE membership.tenant_id = ?
       GROUP BY membership.id, subject.id, subject.display_name, subject.email,
                subject.provider, subject.provider_subject, membership.status,
                membership.created_at
       ORDER BY CASE membership.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
                lower(subject.display_name), subject.id`,
      [tenantId],
    );
    return {
      ...context,
      members: rows.map(mapMemberRow),
    };
  }

  public async createDirectMember(
    command: CreateDirectMemberCommand,
  ): Promise<TenantMemberDirectory> {
    await this.loadTenantWorkspace(command.tenantId, command.workspaceId);
    const displayName = normalizeDisplayName(command.displayName);
    const email = normalizeEmail(command.email);
    await this.assertEmailAvailable(command.tenantId, email);

    await this.database.executeBatch([
      statement(
        `INSERT INTO identity_subjects
           (id, display_name, email, provider, provider_subject, created_at)
         VALUES (?, ?, ?, 'local', ?, ?)`,
        [
          command.subjectId,
          displayName,
          email,
          command.providerSubject,
          command.occurredAt,
        ],
      ),
      statement(
        `INSERT INTO tenant_memberships
           (id, tenant_id, subject_id, status, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          command.membershipId,
          command.tenantId,
          command.subjectId,
          command.initialStatus,
          command.occurredAt,
        ],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "tenant.membership.created",
        entityId: command.membershipId,
        occurredAt: command.occurredAt,
        payload: {
          subjectId: command.subjectId,
          displayName,
          email,
          provider: "local",
          status: command.initialStatus,
        },
      }),
    ]);

    return this.getDirectory(command.tenantId, command.workspaceId);
  }

  public async transitionMembership(
    command: TransitionMembershipCommand,
  ): Promise<TenantMemberDirectory> {
    await this.loadTenantWorkspace(command.tenantId, command.workspaceId);
    const member = await this.loadMember(
      command.tenantId,
      command.membershipId,
    );
    if (
      member.subjectId === command.actorSubjectId &&
      command.targetStatus !== "active"
    ) {
      throw new Error(
        "The acting tenant administrator cannot suspend their own membership.",
      );
    }
    if (member.status === command.targetStatus) {
      return this.getDirectory(command.tenantId, command.workspaceId);
    }
    if (!allowedTransitions[member.status].includes(command.targetStatus)) {
      throw new Error(
        `Tenant membership cannot transition from ${member.status} to ${command.targetStatus}.`,
      );
    }

    await this.database.executeBatch([
      statement(
        `UPDATE tenant_memberships
         SET status = ?
         WHERE id = ? AND tenant_id = ?`,
        [command.targetStatus, command.membershipId, command.tenantId],
      ),
      auditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        eventType: "tenant.membership.status_changed",
        entityId: command.membershipId,
        occurredAt: command.occurredAt,
        payload: {
          subjectId: member.subjectId,
          provider: member.provider,
          from: member.status,
          to: command.targetStatus,
          preservedTenantRoleBindings: String(member.tenantRoleBindingCount),
          preservedWorkspaceRoleBindings: String(
            member.workspaceRoleBindingCount,
          ),
        },
      }),
    ]);

    return this.getDirectory(command.tenantId, command.workspaceId);
  }

  private async loadTenantWorkspace(
    tenantId: string,
    workspaceId: string,
  ): Promise<TenantWorkspaceRow> {
    const [row] = await this.database.query<TenantWorkspaceRow>(
      `SELECT tenant.id AS tenantId,
              tenant.name AS tenantName,
              workspace.id AS workspaceId,
              workspace.name AS workspaceName
       FROM tenants tenant
       JOIN workspaces workspace ON workspace.tenant_id = tenant.id
       WHERE tenant.id = ? AND workspace.id = ?`,
      [tenantId, workspaceId],
    );
    if (!row)
      throw new Error("Tenant member administration context was not found.");
    return row;
  }

  private async loadMember(
    tenantId: string,
    membershipId: string,
  ): Promise<TenantMemberRecord> {
    const [row] = await this.database.query<MemberRow>(
      `SELECT membership.id AS membershipId,
              subject.id AS subjectId,
              subject.display_name AS displayName,
              subject.email,
              subject.provider,
              subject.provider_subject AS providerSubject,
              membership.status,
              membership.created_at AS createdAt,
              COUNT(DISTINCT CASE WHEN binding.workspace_id IS NULL THEN binding.id END)
                AS tenantRoleBindingCount,
              COUNT(DISTINCT CASE WHEN binding.workspace_id IS NOT NULL THEN binding.id END)
                AS workspaceRoleBindingCount
       FROM tenant_memberships membership
       JOIN identity_subjects subject ON subject.id = membership.subject_id
       LEFT JOIN role_bindings binding
         ON binding.tenant_id = membership.tenant_id
        AND binding.subject_id = membership.subject_id
       WHERE membership.tenant_id = ? AND membership.id = ?
       GROUP BY membership.id, subject.id, subject.display_name, subject.email,
                subject.provider, subject.provider_subject, membership.status,
                membership.created_at`,
      [tenantId, membershipId],
    );
    if (!row) throw new Error("Tenant membership was not found.");
    return mapMemberRow(row);
  }

  private async assertEmailAvailable(
    tenantId: string,
    email: string,
  ): Promise<void> {
    const [existing] = await this.database.query<{ membershipId: string }>(
      `SELECT membership.id AS membershipId
       FROM tenant_memberships membership
       JOIN identity_subjects subject ON subject.id = membership.subject_id
       WHERE membership.tenant_id = ? AND lower(subject.email) = lower(?)
       LIMIT 1`,
      [tenantId, email],
    );
    if (existing) {
      throw new Error(
        "A tenant member with this email address already exists.",
      );
    }
  }
}

function mapMemberRow(row: MemberRow): TenantMemberRecord {
  return {
    membershipId: row.membershipId,
    subjectId: row.subjectId,
    displayName: row.displayName,
    email: row.email ?? undefined,
    provider: row.provider,
    providerSubject: row.providerSubject ?? undefined,
    status: row.status,
    createdAt: row.createdAt,
    tenantRoleBindingCount: Number(row.tenantRoleBindingCount),
    workspaceRoleBindingCount: Number(row.workspaceRoleBindingCount),
  };
}

function normalizeDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 100) {
    throw new Error("Member display name must contain 2 to 100 characters.");
  }
  if (/\p{C}/u.test(name)) {
    throw new Error(
      "Member display name contains unsupported control characters.",
    );
  }
  return name;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new Error("A valid member email address is required.");
  }
  return email;
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
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, string>>;
}): DatabaseStatement {
  return statement(
    `INSERT INTO audit_events
       (id, tenant_id, workspace_id, actor_subject_id, event_type,
        entity_type, entity_id, occurred_at, payload_json)
     VALUES (?, ?, ?, ?, ?, 'tenant_membership', ?, ?, ?)`,
    [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.eventType,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  );
}
