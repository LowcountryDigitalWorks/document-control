import type { Hono } from "hono";

export interface Bindings {
  DOCUMENT_CONTROL_DB: D1Database;
  DOCUMENT_CONTENT: R2Bucket;
  APP_NAME?: string;
  BRAND_COMPANY_NAME?: string;
  BRAND_PRIMARY?: string;
  BRAND_SECONDARY?: string;
  BRAND_ACCENT?: string;
  DEMO_MUTATIONS_ENABLED?: string;
}

export type AppEnvironment = { Bindings: Bindings };
export type DocumentControlApp = Hono<AppEnvironment>;
