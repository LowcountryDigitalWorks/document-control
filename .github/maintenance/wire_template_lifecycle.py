from pathlib import Path

index = Path("src/index.ts")
text = index.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"missing {label} marker")
    text = text.replace(old, new, 1)


replace_once(
    'import { AuthorizedRolesAccessAdminService } from "./application/authorized-roles-access-admin-service";\n',
    'import { AuthorizedRolesAccessAdminService } from "./application/authorized-roles-access-admin-service";\nimport { AuthorizedTemplateLifecycleAdminService } from "./application/authorized-template-lifecycle-admin-service";\n',
    "authorized template lifecycle import",
)
replace_once(
    'import { RolesAccessAdminService } from "./application/roles-access-admin-service";\n',
    'import { RolesAccessAdminService } from "./application/roles-access-admin-service";\nimport { TemplateLifecycleAdminService } from "./application/template-lifecycle-admin-service";\nimport {\n  parseTemplateLifecycleInput,\n  TemplateLifecycleInputValidationError,\n} from "./application/template-lifecycle-input";\n',
    "template lifecycle service imports",
)
replace_once(
    'import { ensureGuidedTenantAdmin } from "./demo/tenant-admin-context";\n',
    'import { ensureGuidedTenantAdmin } from "./demo/tenant-admin-context";\nimport { ensureGuidedTemplateManager } from "./demo/template-manager-context";\n',
    "template manager import",
)
replace_once(
    'import { renderRolesAccessAdmin } from "./ui/render-roles-access-admin";\n',
    'import { renderRolesAccessAdmin } from "./ui/render-roles-access-admin";\nimport { renderTemplateLifecycleAdmin } from "./ui/render-template-lifecycle-admin";\n',
    "template lifecycle renderer import",
)

marker = 'app.get("/demo/app/admin/backup", async (context) => {'
routes = '''app.get("/demo/app/admin/templates", async (context) => {
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
  const manager = await ensureGuidedTemplateManager(database, session.sessionId);
  const service = createAuthorizedTemplateLifecycleAdminService(database);

  try {
    const catalog = await service.getCatalog({
      subjectId: manager.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const notice =
      new URL(context.req.url).searchParams.get("notice") === "transitioned"
        ? "Template lifecycle transition recorded."
        : undefined;
    context.header("Cache-Control", "no-store");
    return context.html(
      renderTemplateLifecycleAdmin(
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
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
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const manager = await ensureGuidedTemplateManager(database, sessionId);
    await createAuthorizedTemplateLifecycleAdminService(database).transitionVersion(
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
    return context.redirect("/demo/app/admin/templates?notice=transitioned", 303);
  } catch (error) {
    if (error instanceof TemplateLifecycleInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Template lifecycle transition failed.";
    return context.text(message, 409);
  }
});

'''
if marker not in text:
    raise SystemExit("missing template lifecycle route insertion marker")
text = text.replace(marker, routes + marker, 1)

helper_marker = '''function createAuthorizedPortableExportService(
  database: D1DatabaseProvider,
): AuthorizedPortableExportService {'''
helper = '''function createAuthorizedTemplateLifecycleAdminService(
  database: D1DatabaseProvider,
): AuthorizedTemplateLifecycleAdminService {
  return new AuthorizedTemplateLifecycleAdminService(
    new TemplateLifecycleAdminService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

'''
if helper_marker not in text:
    raise SystemExit("missing template lifecycle service helper marker")
text = text.replace(helper_marker, helper + helper_marker, 1)

form_marker = '''function safeFileSegment(value: string): string {'''
form_helper = '''async function readTemplateLifecycleFormValues(
  request: Request,
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new TemplateLifecycleInputValidationError(
      "A valid form body is required.",
    );
  }
  const values = new URLSearchParams();
  for (const key of ["templateVersionId", "targetState"]) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}

'''
if form_marker not in text:
    raise SystemExit("missing template lifecycle form helper marker")
text = text.replace(form_marker, form_helper + form_marker, 1)
index.write_text(text)

admin_ui = Path("src/ui/render-admin-settings.ts")
ui = admin_ui.read_text()
old = '<p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
new = '<p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/templates">Template Lifecycle</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
if old not in ui:
    raise SystemExit("missing administration navigation marker")
admin_ui.write_text(ui.replace(old, new, 1))

harness = Path("scripts/e2e-d1.ts")
harness_text = harness.read_text()
old_migration = '''    readFile(
      new URL(
        "../migrations/0003_workflow_definition_immutability.sql",
        import.meta.url,
      ),
      "utf8",
    ),
'''
new_migration = old_migration + '''    readFile(
      new URL(
        "../migrations/0004_template_version_lifecycle_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    ),
'''
if old_migration not in harness_text:
    raise SystemExit("missing e2e migration marker")
harness.write_text(harness_text.replace(old_migration, new_migration, 1))
