import type { DatabaseProvider } from "../application/ports";
import { createTheme, type ThemeConfig, type ThemeOverrides } from "../ui/theme";

interface TenantConfigurationRow {
  brandingJson: string;
  terminologyJson: string;
}

export async function createPersistedTenantTheme(
  database: DatabaseProvider,
  environment: Parameters<typeof createTheme>[0],
  tenantId: string,
): Promise<ThemeConfig> {
  const [row] = await database.query<TenantConfigurationRow>(
    `SELECT branding_json AS brandingJson,
            terminology_json AS terminologyJson
     FROM tenant_configurations
     WHERE tenant_id = ?`,
    [tenantId],
  );

  if (!row) {
    return createTheme(environment);
  }

  const overrides: ThemeOverrides = {
    branding: parseStringRecord(row.brandingJson),
    terminology: parseStringRecord(row.terminologyJson),
  };
  return createTheme(environment, overrides);
}

function parseStringRecord(serialized: string): Readonly<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") record[key] = value;
    }
    return record;
  } catch {
    return {};
  }
}
