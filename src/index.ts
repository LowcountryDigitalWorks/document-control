import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { serializeExport } from "./application/export";
import { createSyntheticExport } from "./demo/fixtures";
import {
  isValidGuidedDemoSessionId,
  loadGuidedDemoState,
  runGuidedDemoAction,
  type GuidedDemoAction,
} from "./demo/workflow-demo";
import { D1DatabaseProvider } from "./infrastructure/d1-database-provider";
import { renderGuidedDemo } from "./ui/render-guided-demo";
import { renderHome, renderNotFound } from "./ui/render";
import { createTheme } from "./ui/theme";

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

const guidedDemoSessionCookie = "ldw_guided_demo_session";
const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      styleSrc: ["'unsafe-inline'"],
    },
    crossOriginOpenerPolicy: "same-origin",
    referrerPolicy: "strict-origin-when-cross-origin",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
  }),
);

app.get("/", (context) => context.html(renderHome(createTheme(context.env))));

app.get("/health", (context) =>
  context.json({ status: "ok", service: "document-control" }),
);

app.get("/demo/workflow", async (context) => {
  if (!guidedDemoEnabled(context.env)) {
    return context.html(renderNotFound(createTheme(context.env)), 404);
  }

  const existingSessionId = readGuidedDemoSession(
    context.req.header("Cookie"),
  );
  const sessionId = existingSessionId ?? crypto.randomUUID();
  if (!existingSessionId) {
    context.header(
      "Set-Cookie",
      createGuidedDemoSessionCookie(
        sessionId,
        new URL(context.req.url).protocol === "https:",
      ),
    );
  }

  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const state = await loadGuidedDemoState(database, sessionId);
  return context.html(renderGuidedDemo(createTheme(context.env), state));
});

app.post("/demo/workflow/actions/:action", async (context) => {
  if (!guidedDemoEnabled(context.env)) {
    return context.notFound();
  }
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }

  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      { error: "Guided demo session missing. Reload the guided demo." },
      409,
    );
  }

  const action = parseGuidedDemoAction(context.req.param("action"));
  if (!action) {
    return context.notFound();
  }

  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  try {
    await runGuidedDemoAction(
      database,
      sessionId,
      action,
      new Date().toISOString(),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The guided demo action failed.";
    return context.json({ error: message }, 409);
  }

  return context.redirect("/demo/workflow", 303);
});

app.get("/demo/export", (context) => {
  const exportedAt = new Date().toISOString();
  return context.body(serializeExport(createSyntheticExport(exportedAt)), 200, {
    "Content-Disposition":
      'attachment; filename="document-control-demo-export-v1.json"',
    "Content-Type": "application/json; charset=utf-8",
  });
});

app.get("/favicon.svg", (context) =>
  context.body(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#163b45"/><path d="M15 17h8v23h13v7H15V17Zm25 0h8v30h-8V17Z" fill="#f8f7f2"/></svg>',
    200,
    {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  ),
);

app.notFound((context) =>
  context.html(renderNotFound(createTheme(context.env)), 404),
);

function guidedDemoEnabled(bindings: Bindings): boolean {
  return bindings.DEMO_MUTATIONS_ENABLED === "true";
}

function parseGuidedDemoAction(value: string): GuidedDemoAction | null {
  if (
    value === "create" ||
    value === "submit" ||
    value === "review" ||
    value === "approve" ||
    value === "change"
  ) {
    return value;
  }
  return null;
}

function readGuidedDemoSession(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === guidedDemoSessionCookie && isValidGuidedDemoSessionId(value)) {
      return value.toLowerCase();
    }
  }

  return null;
}

function createGuidedDemoSessionCookie(
  sessionId: string,
  secure: boolean,
): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${guidedDemoSessionCookie}=${sessionId}; Path=/demo/workflow; Max-Age=3600; HttpOnly; SameSite=Strict${secureAttribute}`;
}

function hasSameOrigin(
  requestUrl: string,
  origin: string | undefined,
): boolean {
  if (!origin) {
    return false;
  }
  return origin === new URL(requestUrl).origin;
}

export default app;
