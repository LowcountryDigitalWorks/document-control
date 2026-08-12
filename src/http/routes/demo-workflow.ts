import {
  loadGuidedDemoState,
  runGuidedDemoAction,
} from "../../demo/workflow-demo";
import { renderGuidedDemo } from "../../ui/render-guided-demo";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  hasSameOrigin,
  parseGuidedDemoAction,
  readGuidedDemoSession,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import type { DocumentControlApp } from "../types";

export function registerDemoWorkflowRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/workflow", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    const session = resolveGuidedDemoSession(
      context.req.header("Cookie"),
      context.req.url,
    );
    if (session.setCookie) {
      context.header("Set-Cookie", session.setCookie);
    }

    const { database } = createDependencies(context.env);
    const state = await loadGuidedDemoState(database, session.sessionId);
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

    const { database } = createDependencies(context.env);
    try {
      await runGuidedDemoAction(
        database,
        sessionId,
        action,
        new Date().toISOString(),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The guided demo action failed.";
      return context.json({ error: message }, 409);
    }

    return context.redirect("/demo/workflow", 303);
  });
}
