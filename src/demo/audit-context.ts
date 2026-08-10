import type { DatabaseProvider } from "../application/ports";
import { createGuidedDemoContext } from "./workflow-demo";

export interface GuidedAuditorContext {
  subjectId: string;
  membershipId: string;
  bindingId: string;
}

const seedTimestamp = "2026-08-10T20:30:00.000Z";

export function createGuidedAuditorContext(
  sessionId: string,
): GuidedAuditorContext {
  const namespace = sessionId.toLowerCase().replaceAll("-", "");
  const prefix = `demo-${namespace}`;
  return {
    subjectId: `${prefix}-subject-auditor`,
    membershipId: `${prefix}-membership-auditor`,
    bindingId: `${prefix}-binding-auditor`,
  };
}

export async function ensureGuidedAuditor(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedAuditorContext> {
  const demo = createGuidedDemoContext(sessionId);
  const auditor = createGuidedAuditorContext(sessionId);

  await database.executeBatch([
    {
      sql: "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, 'Morgan Auditor', 'external', ?, ?)",
      parameters: [auditor.subjectId, auditor.subjectId, seedTimestamp],
    },
    {
      sql: "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      parameters: [
        auditor.membershipId,
        demo.tenantId,
        auditor.subjectId,
        seedTimestamp,
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-auditor', ?, ?, ?, ?)",
      parameters: [
        auditor.bindingId,
        auditor.subjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    },
  ]);

  return auditor;
}
