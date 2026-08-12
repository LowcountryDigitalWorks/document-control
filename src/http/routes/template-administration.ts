import { AuthorizationDeniedError } from "../../application/authorization";
import {
  parseTemplateLifecycleInput,
  parseTemplateRevisionInput,
  TemplateLifecycleInputValidationError,
} from "../../application/template-lifecycle-input";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import { ensureGuidedTemplateManager } from "../../demo/template-manager-context";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderTemplateLifecycleAdmin } from "../../ui/render-template-lifecycle-admin";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  hasSameOrigin,
  readGuidedDemoSession,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import { readTemplateLifecycleFormValues } from "../form-values";
import type { DocumentControlApp } from "../types";

export function registerTemplateAdministrationRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/admin/templates", async (context) => {
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
    const dependencies = createDependencies(context.env);
    const demo = createGuidedDemoContext(session.sessionId);
    await ensureGuidedDemoSeed(dependencies.database, session.sessionId);
    const manager = await ensureGuidedTemplateManager(
      dependencies.database,
      session.sessionId,
    );

    try {
      const catalog = await dependencies.templateLifecycleAdmin.getCatalog({
        subjectId: manager.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const noticeValue = new URL(context.req.url).searchParams.get("notice");
      const notice =
        noticeValue === "transitioned"
          ? "Template lifecycle transition recorded."
          : noticeValue === "revision-created"
            ? "Template Draft revision created from exact historical content identity."
            : undefined;
      context.header("Cache-Control", "no-store");
      return context.html(
        renderTemplateLifecycleAdmin(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          catalog,
          notice,
        ),
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/templates/revisions", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Template Lifecycle.",
        },
        409,
      );
    }

    try {
      const input = parseTemplateRevisionInput(
        await readTemplateLifecycleFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const manager = await ensureGuidedTemplateManager(
        dependencies.database,
        sessionId,
      );
      await dependencies.templateLifecycleAdmin.createRevision(
        {
          subjectId: manager.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          sourceTemplateVersionId: input.sourceTemplateVersionId,
          templateVersionId: `template-revision-${crypto.randomUUID()}`,
          revisionNote: input.revisionNote,
          auditEventId: `template-revision-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        "/demo/app/admin/templates?notice=revision-created",
        303,
      );
    } catch (error) {
      if (error instanceof TemplateLifecycleInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error
          ? error.message
          : "Template revision creation failed.",
        409,
      );
    }
  });

  app.post("/demo/app/admin/templates/transition", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Template Lifecycle.",
        },
        409,
      );
    }

    try {
      const input = parseTemplateLifecycleInput(
        await readTemplateLifecycleFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const manager = await ensureGuidedTemplateManager(
        dependencies.database,
        sessionId,
      );
      await dependencies.templateLifecycleAdmin.transitionVersion(
        {
          subjectId: manager.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          templateVersionId: input.templateVersionId,
          targetState: input.targetState,
          auditEventId: `template-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        "/demo/app/admin/templates?notice=transitioned",
        303,
      );
    } catch (error) {
      if (error instanceof TemplateLifecycleInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Template lifecycle transition failed.";
      return context.text(message, 409);
    }
  });
}
