import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import {
  AuditLogFilterValidationError,
  parseAuditLogFilters,
} from "./application/audit-log-filter-input";
import { AuditLogReadService } from "./application/audit-log-read-service";
import { AuthorizationDeniedError } from "./application/authorization";
import { AuthorizedPresentationSettingsService } from "./application/authorized-presentation-settings-service";
import { AuthorizedRolesAccessAdminService } from "./application/authorized-roles-access-admin-service";
import { AuthorizedAuditLogReadService } from "./application/authorized-audit-log-read-service";
import { AuthorizedDocumentDetailReadService } from "./application/authorized-document-detail-read-service";
import { AuthorizedPortableExportService } from "./application/authorized-portable-export-service";
import { AuthorizedReviewApprovalQueueReadService } from "./application/authorized-review-approval-queue-read-service";
import { AuthorizedWorkspaceReadService } from "./application/authorized-workspace-read-service";
import {
  DocumentDetailReadService,
  DocumentNotFoundError,
} from "./application/document-detail-read-service";
import { serializeExport } from "./application/export";
import { PortableExportReadService } from "./application/portable-export-read-service";
import {
  parsePresentationSettingsInput,
  PresentationSettingsValidationError,
} from "./application/presentation-settings-input";
import { PresentationSettingsService } from "./application/presentation-settings-service";
import {
  parseRoleAssignmentInput,
  parseRoleRemovalInput,
  RolesAccessInputValidationError,
} from "./application/roles-access-input";
import { RolesAccessAdminService } from "./application/roles-access-admin-service";
import { ReviewApprovalQueueReadService } from "./application/review-approval-queue-read-service";
import {
  parseDocumentFilters,
  parseTemplateFilters,
  WorkspaceFilterValidationError,
} from "./application/workspace-filter-input";
import { WorkspaceReadService } from "./application/workspace-read-service";
import { ensureGuidedAuditor } from "./demo/audit-context";
import { ensureGuidedBackupAdmin } from "./demo/backup-context";
import { createPersistedTenantTheme } from "./demo/persisted-theme";
import { ensureGuidedTenantAdmin } from "./demo/tenant-admin-context";
import { ensureGuidedEvidenceReader } from "./demo/evidence-context";
import { createSyntheticExport } from "./demo/fixtures";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
  isValidGuidedDemoSessionId,
  loadGuidedDemoState,
  runGuidedDemoAction,
  type GuidedDemoAction,
} from "./demo/workflow-demo";
import { DatabaseAuthorizationPolicy } from "./infrastructure/database-authorization-policy";
import { D1DatabaseProvider } from "./infrastructure/d1-database-provider";
import { renderAdminSettings } from "./ui/render-admin-settings";
import { renderAuditLog } from "./ui/render-audit-log";
import { renderBackupPortability } from "./ui/render-backup-portability";
import { renderDocumentDetail } from "./ui/render-document-detail";
import { renderGuidedDemo } from "./ui/render-guided-demo";
import { renderReviewApprovalQueue } from "./ui/render-review-approval-queue";
import { renderRolesAccessAdmin } from "./ui/render-roles-access-admin";
import {
  renderWorkspaceDocuments,
  renderWorkspaceOverview,
  renderWorkspaceTemplates,
} from "./ui/render-workspace-app";
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

  const session = resolveGuidedDemoSession(
    context.req.header("Cookie"),
    context.req.url,
  );
  if (session.setCookie) {
    context.header("Set-Cookie", session.setCookie);
  }

  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const read = createAuthorizedWorkspaceReadService(database);
  const overview = await read.getOverview({
    subjectId: demo.authorSubjectId,
    tenantId: demo.tenantId,
    workspaceId: demo.workspaceId,
  });
  return context.html(
    renderWorkspaceOverview(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const read = createAuthorizedWorkspaceReadService(database);
  const documents = await read.listDocuments(
    {
      subjectId: demo.authorSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    },
    filters,
  );
  return context.html(
    renderWorkspaceDocuments(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const evidenceReader = await ensureGuidedEvidenceReader(
    database,
    session.sessionId,
  );
  const read = createAuthorizedDocumentDetailReadService(database);

  try {
    const detail = await read.getDocumentDetail({
      subjectId: evidenceReader.subjectId,
      tenantId: demo.tenantId,
      documentId: context.req.param("documentId"),
    });
    return context.html(
      renderDocumentDetail(
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
        detail,
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const read = createAuthorizedWorkspaceReadService(database);
  const templates = await read.listTemplates(
    {
      subjectId: demo.authorSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    },
    filters,
  );
  return context.html(
    renderWorkspaceTemplates(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
      demo.workspaceName,
      templates,
      filters,
    ),
  );
});

app.get("/demo/app/reviews", async (context) => {
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const read = createAuthorizedReviewApprovalQueueReadService(database);
  const items = await read.listReviewQueue({
    subjectId: demo.reviewerSubjectId,
    tenantId: demo.tenantId,
    workspaceId: demo.workspaceId,
  });
  return context.html(
    renderReviewApprovalQueue(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
      demo.workspaceName,
      "review",
      items,
    ),
  );
});

app.get("/demo/app/approvals", async (context) => {
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const read = createAuthorizedReviewApprovalQueueReadService(database);
  const items = await read.listApprovalQueue({
    subjectId: demo.approverSubjectId,
    tenantId: demo.tenantId,
    workspaceId: demo.workspaceId,
  });
  return context.html(
    renderReviewApprovalQueue(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
      demo.workspaceName,
      "approval",
      items,
    ),
  );
});

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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const auditor = await ensureGuidedAuditor(database, session.sessionId);
  const items = await createAuthorizedAuditLogReadService(
    database,
  ).listAuditEvents(
    {
      subjectId: auditor.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    },
    filters,
  );
  return context.html(
    renderAuditLog(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
      demo.workspaceName,
      items,
      filters,
    ),
  );
});

app.get("/demo/app/admin/settings", async (context) => {
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const admin = await ensureGuidedTenantAdmin(database, session.sessionId);
  const service = createAuthorizedPresentationSettingsService(database);

  try {
    const settings = await service.getSettings({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const theme = await createPersistedTenantTheme(
      database,
      context.env,
      demo.tenantId,
    );
    context.header("Cache-Control", "no-store");
    return context.html(
      renderAdminSettings(
        theme,
        settings,
        new URL(context.req.url).searchParams.get("saved") === "1",
      ),
    );
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    throw error;
  }
});

app.post("/demo/app/admin/settings", async (context) => {
  if (!guidedDemoEnabled(context.env)) {
    return context.notFound();
  }
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }

  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Administration.",
      },
      409,
    );
  }

  let formData: FormData;
  try {
    formData = await context.req.raw.formData();
  } catch {
    return context.text("A valid form body is required.", 400);
  }
  const values = new URLSearchParams();
  for (const key of [
    "workspaceName",
    "appName",
    "companyName",
    "primary",
    "secondary",
    "accent",
    "workspaceTerm",
    "documentTerm",
    "approvalTerm",
  ]) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }

  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(sessionId);
  await ensureGuidedDemoSeed(database, sessionId);
  const admin = await ensureGuidedTenantAdmin(database, sessionId);
  const service = createAuthorizedPresentationSettingsService(database);

  try {
    const input = parsePresentationSettingsInput(values);
    await service.updateSettings(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        input,
        occurredAt: new Date().toISOString(),
        auditEventId: `settings-${crypto.randomUUID()}`,
      },
    );
  } catch (error) {
    if (error instanceof PresentationSettingsValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    throw error;
  }

  return context.redirect("/demo/app/admin/settings?saved=1", 303);
});

app.get("/demo/app/admin/access", async (context) => {
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const admin = await ensureGuidedTenantAdmin(database, session.sessionId);
  const service = createAuthorizedRolesAccessAdminService(database);

  try {
    const snapshot = await service.getWorkspaceAccess({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const noticeValue = new URL(context.req.url).searchParams.get("notice");
    const notice =
      noticeValue === "assigned"
        ? "Workspace role assigned."
        : noticeValue === "removed"
          ? "Workspace role removed."
          : noticeValue === "unchanged"
            ? "No access change was needed."
            : undefined;
    context.header("Cache-Control", "no-store");
    return context.html(
      renderRolesAccessAdmin(
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
        snapshot,
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

app.post("/demo/app/admin/access/assign", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Roles & Access.",
      },
      409,
    );
  }

  try {
    const input = parseRoleAssignmentInput(
      await readFormValues(context.req.raw, ["subjectId", "roleDefinitionId"]),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    const result = await createAuthorizedRolesAccessAdminService(
      database,
    ).assignWorkspaceRole(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        subjectId: input.subjectId,
        roleDefinitionId: input.roleDefinitionId,
        bindingId: `access-${crypto.randomUUID()}`,
        auditEventId: `access-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      },
    );
    return context.redirect(
      `/demo/app/admin/access?notice=${result.changed ? "assigned" : "unchanged"}`,
      303,
    );
  } catch (error) {
    if (error instanceof RolesAccessInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Role assignment failed.";
    return context.text(message, 409);
  }
});

app.post("/demo/app/admin/access/remove", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Roles & Access.",
      },
      409,
    );
  }

  try {
    const input = parseRoleRemovalInput(
      await readFormValues(context.req.raw, ["bindingId"]),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    const result = await createAuthorizedRolesAccessAdminService(
      database,
    ).removeWorkspaceRole(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        bindingId: input.bindingId,
        auditEventId: `access-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      },
    );
    return context.redirect(
      `/demo/app/admin/access?notice=${result.changed ? "removed" : "unchanged"}`,
      303,
    );
  } catch (error) {
    if (error instanceof RolesAccessInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Role removal failed.";
    return context.text(message, 409);
  }
});

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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const admin = await ensureGuidedBackupAdmin(database, session.sessionId);
  const exported = await createAuthorizedPortableExportService(
    database,
  ).createTenantExport({
    subjectId: admin.subjectId,
    tenantId: demo.tenantId,
    exportedAt: new Date().toISOString(),
  });
  return context.html(
    renderBackupPortability(
      await createPersistedTenantTheme(database, context.env, demo.tenantId),
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
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const admin = await ensureGuidedBackupAdmin(database, session.sessionId);
  const exported = await createAuthorizedPortableExportService(
    database,
  ).createTenantExport({
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

function createAuthorizedWorkspaceReadService(
  database: D1DatabaseProvider,
): AuthorizedWorkspaceReadService {
  return new AuthorizedWorkspaceReadService(
    new WorkspaceReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedDocumentDetailReadService(
  database: D1DatabaseProvider,
): AuthorizedDocumentDetailReadService {
  return new AuthorizedDocumentDetailReadService(
    new DocumentDetailReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedReviewApprovalQueueReadService(
  database: D1DatabaseProvider,
): AuthorizedReviewApprovalQueueReadService {
  return new AuthorizedReviewApprovalQueueReadService(
    new ReviewApprovalQueueReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedAuditLogReadService(
  database: D1DatabaseProvider,
): AuthorizedAuditLogReadService {
  return new AuthorizedAuditLogReadService(
    new AuditLogReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedPresentationSettingsService(
  database: D1DatabaseProvider,
): AuthorizedPresentationSettingsService {
  return new AuthorizedPresentationSettingsService(
    new PresentationSettingsService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedRolesAccessAdminService(
  database: D1DatabaseProvider,
): AuthorizedRolesAccessAdminService {
  return new AuthorizedRolesAccessAdminService(
    new RolesAccessAdminService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

function createAuthorizedPortableExportService(
  database: D1DatabaseProvider,
): AuthorizedPortableExportService {
  return new AuthorizedPortableExportService(
    new PortableExportReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

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

function resolveGuidedDemoSession(
  cookieHeader: string | undefined,
  requestUrl: string,
): { sessionId: string; setCookie?: string } {
  const existingSessionId = readGuidedDemoSession(cookieHeader);
  if (existingSessionId) {
    return { sessionId: existingSessionId };
  }

  const sessionId = crypto.randomUUID();
  return {
    sessionId,
    setCookie: createGuidedDemoSessionCookie(
      sessionId,
      new URL(requestUrl).protocol === "https:",
    ),
  };
}

function readGuidedDemoSession(
  cookieHeader: string | undefined,
): string | null {
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
  return `${guidedDemoSessionCookie}=${sessionId}; Path=/demo; Max-Age=3600; HttpOnly; SameSite=Strict${secureAttribute}`;
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

async function readFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new RolesAccessInputValidationError("A valid form body is required.");
  }
  const values = new URLSearchParams();
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}

function safeFileSegment(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "tenant";
}

export default app;
