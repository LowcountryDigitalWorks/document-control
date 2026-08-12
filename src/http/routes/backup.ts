import { serializeExport } from "../../application/export";
import { ensureGuidedBackupAdmin } from "../../demo/backup-context";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderBackupPortability } from "../../ui/render-backup-portability";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import type { DocumentControlApp } from "../types";

export function registerBackupRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/admin/backup", async (context) => {
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
    const admin = await ensureGuidedBackupAdmin(
      dependencies.database,
      session.sessionId,
    );
    const exported = await dependencies.portableExport.createTenantExport({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      exportedAt: new Date().toISOString(),
    });
    return context.html(
      renderBackupPortability(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        exported,
      ),
    );
  });

  app.get("/demo/app/admin/backup/export", async (context) => {
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
    const admin = await ensureGuidedBackupAdmin(
      dependencies.database,
      session.sessionId,
    );
    const exported = await dependencies.portableExport.createTenantExport({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      exportedAt: new Date().toISOString(),
    });
    const fileName = `document-control-${safeFileSegment(exported.tenant.slug)}-export-v${exported.version}.json`;
    return context.body(serializeExport(exported), 200, {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "application/json; charset=utf-8",
    });
  });
}

function safeFileSegment(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "tenant";
}
