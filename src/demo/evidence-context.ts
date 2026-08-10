import type { DatabaseProvider } from "../application/ports";
import { createGuidedDemoContext } from "./workflow-demo";

export interface GuidedEvidenceContext {
  subjectId: string;
  membershipId: string;
  bindingId: string;
}

const seedTimestamp = "2026-08-10T20:30:00.000Z";

export function createGuidedEvidenceContext(
  sessionId: string,
): GuidedEvidenceContext {
  const namespace = sessionId.toLowerCase().replaceAll("-", "");
  const prefix = `demo-${namespace}`;
  return {
    subjectId: `${prefix}-subject-document-owner`,
    membershipId: `${prefix}-membership-document-owner`,
    bindingId: `${prefix}-binding-document-owner`,
  };
}

export async function ensureGuidedEvidenceReader(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedEvidenceContext> {
  const demo = createGuidedDemoContext(sessionId);
  const evidence = createGuidedEvidenceContext(sessionId);

  await database.executeBatch([
    {
      sql: "INSERT OR IGNORE INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, 'Morgan Document Owner', 'external', ?, ?)",
      parameters: [evidence.subjectId, evidence.subjectId, seedTimestamp],
    },
    {
      sql: "INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      parameters: [
        evidence.membershipId,
        demo.tenantId,
        evidence.subjectId,
        seedTimestamp,
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-document-owner', ?, ?, ?, ?)",
      parameters: [
        evidence.bindingId,
        evidence.subjectId,
        demo.tenantId,
        demo.workspaceId,
        seedTimestamp,
      ],
    },
  ]);

  return evidence;
}
