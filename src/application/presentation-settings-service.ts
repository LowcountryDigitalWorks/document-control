import type { TenantConfiguration } from "../domain/models";
import type { PresentationSettingsInput } from "./presentation-settings-input";
import type { DatabaseProvider, DatabaseStatement } from "./ports";

export interface PresentationSettingsSnapshot {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  permittedDataProfile: TenantConfiguration["permittedDataProfile"];
  branding: Readonly<Record<string, string>>;
  terminology: Readonly<Record<string, string>>;
  updatedAt: string;
}

export interface UpdatePresentationSettingsCommand {
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  occurredAt: string;
  auditEventId: string;
  input: PresentationSettingsInput;
}

export interface PresentationSettingsUpdateResult {
  changed: boolean;
  settings: PresentationSettingsSnapshot;
}

interface SettingsRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  permittedDataProfile: TenantConfiguration["permittedDataProfile"];
  brandingJson: string;
  terminologyJson: string;
  updatedAt: string;
}

export class PresentationSettingsService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async getSettings(
    tenantId: string,
    workspaceId: string,
  ): Promise<PresentationSettingsSnapshot> {
    const [row] = await this.database.query<SettingsRow>(
      `SELECT
         tenant.id AS tenantId,
         tenant.name AS tenantName,
         tenant.slug AS tenantSlug,
         workspace.id AS workspaceId,
         workspace.name AS workspaceName,
         configuration.permitted_data_profile AS permittedDataProfile,
         configuration.branding_json AS brandingJson,
         configuration.terminology_json AS terminologyJson,
         configuration.updated_at AS updatedAt
       FROM tenants tenant
       JOIN workspaces workspace
         ON workspace.tenant_id = tenant.id
       JOIN tenant_configurations configuration
         ON configuration.tenant_id = tenant.id
       WHERE tenant.id = ? AND workspace.id = ?`,
      [tenantId, workspaceId],
    );

    if (!row) {
      throw new Error(
        "Tenant presentation settings were not found for the requested workspace.",
      );
    }

    return {
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      permittedDataProfile: row.permittedDataProfile,
      branding: parseStringRecord(row.brandingJson, "branding_json"),
      terminology: parseStringRecord(row.terminologyJson, "terminology_json"),
      updatedAt: row.updatedAt,
    };
  }

  public async updateSettings(
    command: UpdatePresentationSettingsCommand,
  ): Promise<PresentationSettingsUpdateResult> {
    const current = await this.getSettings(command.tenantId, command.workspaceId);
    const nextBranding = {
      ...current.branding,
      appName: command.input.appName,
      companyName: command.input.companyName,
      primary: command.input.primary,
      secondary: command.input.secondary,
      accent: command.input.accent,
    };
    const nextTerminology = {
      ...current.terminology,
      workspace: command.input.workspaceTerm,
      document: command.input.documentTerm,
      approval: command.input.approvalTerm,
    };

    const changedFields = changedFieldNames(current, command.input);
    if (changedFields.length === 0) {
      return { changed: false, settings: current };
    }

    const statements: DatabaseStatement[] = [];
    if (current.workspaceName !== command.input.workspaceName) {
      statements.push({
        sql: "UPDATE workspaces SET name = ? WHERE id = ? AND tenant_id = ?",
        parameters: [
          command.input.workspaceName,
          command.workspaceId,
          command.tenantId,
        ],
      });
    }

    statements.push(
      {
        sql: `UPDATE tenant_configurations
              SET branding_json = ?, terminology_json = ?, updated_at = ?
              WHERE tenant_id = ?`,
        parameters: [
          JSON.stringify(nextBranding),
          JSON.stringify(nextTerminology),
          command.occurredAt,
          command.tenantId,
        ],
      },
      {
        sql: `INSERT INTO audit_events
                (id, tenant_id, workspace_id, actor_subject_id, event_type,
                 entity_type, entity_id, occurred_at, payload_json)
              VALUES (?, ?, ?, ?, 'tenant.presentation_settings.updated',
                      'tenant_configuration', ?, ?, ?)`,
        parameters: [
          command.auditEventId,
          command.tenantId,
          command.workspaceId,
          command.actorSubjectId,
          command.tenantId,
          command.occurredAt,
          JSON.stringify({ changedFields: changedFields.join(", ") }),
        ],
      },
    );

    await this.database.executeBatch(statements);
    return {
      changed: true,
      settings: await this.getSettings(command.tenantId, command.workspaceId),
    };
  }
}

function changedFieldNames(
  current: PresentationSettingsSnapshot,
  input: PresentationSettingsInput,
): string[] {
  const fields: string[] = [];
  const comparisons: readonly [string, string | undefined, string][] = [
    ["workspaceName", current.workspaceName, input.workspaceName],
    ["appName", current.branding.appName, input.appName],
    ["companyName", current.branding.companyName, input.companyName],
    ["primary", current.branding.primary, input.primary],
    ["secondary", current.branding.secondary, input.secondary],
    ["accent", current.branding.accent, input.accent],
    ["workspaceTerm", current.terminology.workspace, input.workspaceTerm],
    ["documentTerm", current.terminology.document, input.documentTerm],
    ["approvalTerm", current.terminology.approval, input.approvalTerm],
  ];
  for (const [name, before, after] of comparisons) {
    if (before !== after) fields.push(name);
  }
  return fields;
}

function parseStringRecord(
  serialized: string,
  fieldName: string,
): Readonly<Record<string, string>> {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must contain a JSON object.`);
  }

  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`${fieldName} values must be strings.`);
    }
    record[key] = value;
  }
  return record;
}
