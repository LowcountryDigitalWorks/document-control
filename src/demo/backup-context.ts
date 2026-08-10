import type { DatabaseProvider } from "../application/ports";
import {
  createGuidedTenantAdminContext,
  ensureGuidedTenantAdmin,
  type GuidedTenantAdminContext,
} from "./tenant-admin-context";

export type GuidedBackupAdminContext = GuidedTenantAdminContext;

export function createGuidedBackupAdminContext(
  sessionId: string,
): GuidedBackupAdminContext {
  return createGuidedTenantAdminContext(sessionId);
}

export async function ensureGuidedBackupAdmin(
  database: DatabaseProvider,
  sessionId: string,
): Promise<GuidedBackupAdminContext> {
  return ensureGuidedTenantAdmin(database, sessionId);
}
