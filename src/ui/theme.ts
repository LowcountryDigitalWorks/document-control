export interface ThemeConfig {
  appName: string;
  companyName: string;
  primary: string;
  secondary: string;
  accent: string;
  logoHref?: string;
  darkLogoHref?: string;
  faviconHref?: string;
  terminology: {
    workspace: string;
    document: string;
    approval: string;
  };
}

export interface ThemeOverrides {
  branding?: Readonly<Record<string, string>>;
  terminology?: Readonly<Record<string, string>>;
}

export function createTheme(
  environment: {
    APP_NAME?: string;
    BRAND_COMPANY_NAME?: string;
    BRAND_PRIMARY?: string;
    BRAND_SECONDARY?: string;
    BRAND_ACCENT?: string;
  },
  overrides: ThemeOverrides = {},
): ThemeConfig {
  const branding = overrides.branding ?? {};
  const terminology = overrides.terminology ?? {};
  return {
    appName: safeText(
      branding.appName,
      environment.APP_NAME ?? "Document Control",
      80,
    ),
    companyName: safeText(
      branding.companyName,
      environment.BRAND_COMPANY_NAME ?? "Lowcountry Digital Works",
      100,
    ),
    primary: safeColor(
      branding.primary,
      safeColor(environment.BRAND_PRIMARY, "#163b45"),
    ),
    secondary: safeColor(
      branding.secondary,
      safeColor(environment.BRAND_SECONDARY, "#247b78"),
    ),
    accent: safeColor(
      branding.accent,
      safeColor(environment.BRAND_ACCENT, "#8e4228"),
    ),
    faviconHref: "/favicon.svg",
    terminology: {
      workspace: safeText(terminology.workspace, "Workspace", 40),
      document: safeText(terminology.document, "Document", 40),
      approval: safeText(terminology.approval, "Approval", 40),
    },
  };
}

function safeText(
  configured: string | undefined,
  fallback: string,
  maximumLength: number,
): string {
  const value = configured?.trim();
  if (
    !value ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return fallback;
  }
  return value;
}

function safeColor(configured: string | undefined, fallback: string): string {
  const value = configured?.trim().toLowerCase();
  return value && /^#[0-9a-f]{6}$/u.test(value) ? value : fallback;
}
