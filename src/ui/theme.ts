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

export function createTheme(environment: {
  APP_NAME?: string;
  BRAND_COMPANY_NAME?: string;
  BRAND_PRIMARY?: string;
  BRAND_SECONDARY?: string;
  BRAND_ACCENT?: string;
}): ThemeConfig {
  return {
    appName: environment.APP_NAME ?? "Document Control",
    companyName: environment.BRAND_COMPANY_NAME ?? "Lowcountry Digital Works",
    primary: environment.BRAND_PRIMARY ?? "#163b45",
    secondary: environment.BRAND_SECONDARY ?? "#247b78",
    accent: environment.BRAND_ACCENT ?? "#8e4228",
    faviconHref: "/favicon.svg",
    terminology: {
      workspace: "Workspace",
      document: "Document",
      approval: "Approval",
    },
  };
}
