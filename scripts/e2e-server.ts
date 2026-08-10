import { serve } from "@hono/node-server";
import app, { type Bindings } from "../src/index";
import { createE2eD1Database } from "./e2e-d1";

const testBindings = {
  DOCUMENT_CONTROL_DB: await createE2eD1Database(),
  APP_NAME: "Document Control",
  BRAND_COMPANY_NAME: "Lowcountry Digital Works",
  BRAND_PRIMARY: "#163b45",
  BRAND_SECONDARY: "#247b78",
  BRAND_ACCENT: "#8e4228",
  DEMO_MUTATIONS_ENABLED: "true",
} as Bindings;

serve({
  fetch: (request) => app.fetch(request, testBindings),
  hostname: "127.0.0.1",
  port: 8787,
});
