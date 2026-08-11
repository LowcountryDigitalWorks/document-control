import type { DatabaseProvider } from "../application/ports";
import { createGuidedDemoContext } from "./workflow-demo";

export interface GuidedTemplateManagerContext {
  subjectId: string;
  membershipId: string;
  bindingId: string;
}

const seedTimestamp = "2026-08-10T20:30:00.000Z";

export function createGuidedTemplateManagerContext(
  sessionId: string,
): GuidedTemplateManagerContext {
  const namespace = sessionId.toLowerCase().replaceAll("-", "");
  const prefix = `demo-${namespace}`;
  return {
    subjectId: `${prefix}-subject-template-manager`,
    membershipId: `${prefix}-membership-template-manager`,
    bindingId: `${prefix}-binding-template-manager`,
  };
}

export async function ensureGuidedTemplateManager(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedTemplateManagerContext> {
  const demo = createGuidedDemoContext(sessionId);
  const manager = createGuidedTemplateManagerContext(sessionId);
  await database.executeBatch([
    {
      sql: "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, 'Morgan Template Manager', 'external', ?, ?)",
      parameters: [manager.subjectId, manager.subjectId, seedTimestamp],
    },
    {
      sql: "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      parameters: [
        manager.membershipId,
        demo.tenantId,
        manager.subjectId,
        seedTimestamp,
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-template-manager', ?, ?, ?, ?)",
      parameters: [
        manager.bindingId,
        manager.subjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    },
  ]);
  return manager;
}
