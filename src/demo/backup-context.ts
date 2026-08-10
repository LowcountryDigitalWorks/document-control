import type { DatabaseProvider } from "../application/ports";
import { createGuidedDemoContext } from "./workflow-demo";

export interface GuidedBackupAdminContext {
  subjectId: string;
  membershipId: string;
  bindingId: string;
}

const seedTimestamp = "2026-08-10T20:30:00.000Z";

export function createGuidedBackupAdminContext(
  sessionId: string,
): GuidedBackupAdminContext {
  const namespace = sessionId.toLowerCase().replaceAll("-", "");
  const prefix = `demo-${namespace}`;
  return {
    subjectId: `${prefix}-subject-tenant-admin`,
    membershipId: `${prefix}-membership-tenant-admin`,
    bindingId: `${prefix}-binding-tenant-admin`,
  };
}

export async function ensureGuidedBackupAdmin(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedBackupAdminContext> {
  const demo = createGuidedDemoContext(sessionId);
  const admin = createGuidedBackupAdminContext(sessionId);

  await database.executeBatch([
    {
      sql: "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, 'Taylor Tenant Admin', 'external', ?, ?)",
      parameters: [admin.subjectId, admin.subjectId, seedTimestamp],
    },
    {
      sql: "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      parameters: [
        admin.membershipId,
        demo.tenantId,
        admin.subjectId,
        seedTimestamp,
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-tenant-admin', ?, ?, NULL, ?)",
      parameters: [
        admin.bindingId,
        admin.subjectId,
        demo.tenantId,
        seedTimestamp,
      ],
    },
    {
      sql: `INSERT OR IGNORE INTO tenant_configurations
              (tenant_id, permitted_data_profile, branding_json, terminology_json, updated_at)
            VALUES (?, 'demo_synthetic', ?, ?, ?)`,
      parameters: [
        demo.tenantId,
        JSON.stringify({
          companyName: "Lowcountry Digital Works",
          primary: "#163b45",
          secondary: "#247b78",
        }),
        JSON.stringify({
          workspace: "Workspace",
          document: "Document",
          approval: "Approval",
        }),
        seedTimestamp,
      ],
    },
  ]);

  return admin;
}
