import { serve } from "@hono/node-server";
import app, { type Bindings } from "../src/index";

const testBindings = {
  APP_NAME: "Document Control",
  BRAND_COMPANY_NAME: "Lowcountry Digital Works",
  BRAND_PRIMARY: "#163b45",
  BRAND_SECONDARY: "#247b78",
  BRAND_ACCENT: "#8e4228",
} as Bindings;

serve({
  fetch: (request) => app.fetch(request, testBindings),
  hostname: "127.0.0.1",
  port: 8787,
});
