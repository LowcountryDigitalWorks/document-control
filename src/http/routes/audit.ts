import {
  AuditLogFilterValidationError,
  parseAuditLogFilters,
} from "../../application/audit-log-filter-input";
import { serializeAuditLogCsv } from "../../application/audit-log-export";
import { ensureGuidedAuditor } from "../../demo/audit-context";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderAuditLog } from "../../ui/render-audit-log";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import { guidedDemoEnabled, resolveGuidedDemoSession } from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import type { DocumentControlApp } from "../types";

export function registerAuditRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/audit", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    let filters;
    try {
      filters = parseAuditLogFilters(new URL(context.req.url).searchParams);
    } catch (error) {
      if (error instanceof AuditLogFilterValidationError) {
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
    const auditor = await ensureGuidedAuditor(
      dependencies.database,
      session.sessionId,
    );
    const items = await dependencies.auditLogRead.listAuditEvents(
      {
        subjectId: auditor.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      filters,
    );
    return context.html(
      renderAuditLog(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        demo.workspaceName,
        items,
        filters,
      ),
    );
  });

  app.get("/demo/app/audit/export.csv", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    let filters;
    try {
      filters = parseAuditLogFilters(new URL(context.req.url).searchParams);
    } catch (error) {
      if (error instanceof AuditLogFilterValidationError) {
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
    const auditor = await ensureGuidedAuditor(
      dependencies.database,
      session.sessionId,
    );
    const items = await dependencies.auditLogRead.listAuditEvents(
      {
        subjectId: auditor.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      filters,
    );

    context.header("Cache-Control", "no-store");
    context.header("Content-Type", "text/csv; charset=utf-8");
    context.header(
      "Content-Disposition",
      'attachment; filename="workspace-audit-log.csv"',
    );
    return context.body(serializeAuditLogCsv(items));
  });
}
