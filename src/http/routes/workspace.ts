import { AuthorizationDeniedError } from "../../application/authorization";
import { DocumentNotFoundError } from "../../application/document-detail-read-service";
import {
  DocumentRetirementInputValidationError,
  parseDocumentRetirementInput,
} from "../../application/document-retirement-input";
import { serializeDocumentEvidenceManifest } from "../../application/document-evidence-export";
import { TemplateNotFoundError } from "../../application/template-detail-read-service";
import {
  parseDocumentFilters,
  parseTemplateFilters,
  WorkspaceFilterValidationError,
} from "../../application/workspace-filter-input";
import { ensureGuidedEvidenceReader } from "../../demo/evidence-context";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderDocumentDetail } from "../../ui/render-document-detail";
import { renderTemplateDetail } from "../../ui/render-template-detail";
import {
  renderWorkspaceDocuments,
  renderWorkspaceOverview,
  renderWorkspaceTemplates,
} from "../../ui/render-workspace-app";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  hasSameOrigin,
  readGuidedDemoSession,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import { readDocumentRetirementFormValues } from "../form-values";
import type { DocumentControlApp } from "../types";

export function registerWorkspaceRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app", async (context) => {
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
    const overview = await dependencies.workspaceRead.getOverview({
      subjectId: demo.authorSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    return context.html(
      renderWorkspaceOverview(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        overview,
      ),
    );
  });

  app.get("/demo/app/documents", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    let filters;
    try {
      filters = parseDocumentFilters(new URL(context.req.url).searchParams);
    } catch (error) {
      if (error instanceof WorkspaceFilterValidationError) {
        return context.text(error.message, 400);
      }
      throw error;
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
    const documents = await dependencies.workspaceRead.listDocuments(
      {
        subjectId: demo.authorSubjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      filters,
    );
    return context.html(
      renderWorkspaceDocuments(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        demo.workspaceName,
        documents,
        filters,
      ),
    );
  });

  app.get("/demo/app/documents/:documentId", async (context) => {
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
    const evidenceReader = await ensureGuidedEvidenceReader(
      dependencies.database,
      session.sessionId,
    );

    try {
      const detail = await dependencies.documentDetailRead.getDocumentDetail({
        subjectId: evidenceReader.subjectId,
        tenantId: demo.tenantId,
        documentId: context.req.param("documentId"),
      });
      const notice =
        new URL(context.req.url).searchParams.get("notice") === "retired"
          ? "Document retired. Historical versions, approvals, workflows, provenance, and audit evidence remain preserved."
          : undefined;
      return context.html(
        renderDocumentDetail(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          detail,
          notice,
        ),
      );
    } catch (error) {
      if (
        error instanceof AuthorizationDeniedError ||
        error instanceof DocumentNotFoundError
      ) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.get("/demo/app/documents/:documentId/evidence.json", async (context) => {
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
    const evidenceReader = await ensureGuidedEvidenceReader(
      dependencies.database,
      session.sessionId,
    );

    try {
      const detail = await dependencies.documentDetailRead.getDocumentDetail({
        subjectId: evidenceReader.subjectId,
        tenantId: demo.tenantId,
        documentId: context.req.param("documentId"),
      });
      context.header("Cache-Control", "no-store");
      context.header("Content-Type", "application/json; charset=utf-8");
      context.header(
        "Content-Disposition",
        'attachment; filename="document-evidence.json"',
      );
      return context.body(
        serializeDocumentEvidenceManifest(detail, new Date().toISOString()),
      );
    } catch (error) {
      if (
        error instanceof AuthorizationDeniedError ||
        error instanceof DocumentNotFoundError
      ) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/documents/:documentId/retire", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        { error: "Synthetic evidence session missing. Reload the document." },
        409,
      );
    }

    try {
      parseDocumentRetirementInput(
        await readDocumentRetirementFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const evidenceReader = await ensureGuidedEvidenceReader(
        dependencies.database,
        sessionId,
      );
      await dependencies.documentWorkflow.retireDocument({
        tenantId: demo.tenantId,
        documentId: context.req.param("documentId"),
        actorSubjectId: evidenceReader.subjectId,
        auditEventId: `document-retirement-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      });
      return context.redirect(
        `/demo/app/documents/${encodeURIComponent(context.req.param("documentId"))}?notice=retired`,
        303,
      );
    } catch (error) {
      if (error instanceof DocumentRetirementInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error ? error.message : "Document retirement failed.",
        409,
      );
    }
  });

  app.get("/demo/app/templates", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    let filters;
    try {
      filters = parseTemplateFilters(new URL(context.req.url).searchParams);
    } catch (error) {
      if (error instanceof WorkspaceFilterValidationError) {
        return context.text(error.message, 400);
      }
      throw error;
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
    const templates = await dependencies.workspaceRead.listTemplates(
      {
        subjectId: demo.authorSubjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      filters,
    );
    return context.html(
      renderWorkspaceTemplates(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        demo.workspaceName,
        templates,
        filters,
      ),
    );
  });

  app.get("/demo/app/templates/:templateId", async (context) => {
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

    try {
      const detail = await dependencies.templateDetailRead.getTemplateDetail({
        subjectId: demo.authorSubjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
        templateId: context.req.param("templateId"),
      });
      context.header("Cache-Control", "no-store");
      return context.html(
        renderTemplateDetail(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          detail,
        ),
      );
    } catch (error) {
      if (
        error instanceof AuthorizationDeniedError ||
        error instanceof TemplateNotFoundError
      ) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });
}
