from pathlib import Path

index = Path("src/index.ts")
text = index.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"missing {label} marker")
    text = text.replace(old, new, 1)


replace_once(
    'import { AuthorizedWorkspaceReadService } from "./application/authorized-workspace-read-service";\n',
    'import { AuthorizedWorkspaceReadService } from "./application/authorized-workspace-read-service";\nimport { AuthorizedWorkflowDefinitionAdminService } from "./application/authorized-workflow-definition-admin-service";\n',
    "authorized workflow administration import",
)
replace_once(
    'import { WorkspaceReadService } from "./application/workspace-read-service";\n',
    'import { WorkspaceReadService } from "./application/workspace-read-service";\nimport { WorkflowDefinitionAdminService } from "./application/workflow-definition-admin-service";\nimport {\n  parseExistingWorkflowId,\n  parseWorkflowDefinitionInput,\n  WorkflowDefinitionInputValidationError,\n} from "./application/workflow-definition-input";\n',
    "workflow administration service imports",
)
replace_once(
    'import { renderRolesAccessAdmin } from "./ui/render-roles-access-admin";\n',
    'import { renderRolesAccessAdmin } from "./ui/render-roles-access-admin";\nimport { renderWorkflowDefinitionAdmin } from "./ui/render-workflow-definition-admin";\n',
    "workflow administration renderer import",
)

marker = 'app.get("/demo/app/admin/backup", async (context) => {'
routes = '''app.get("/demo/app/admin/workflows", async (context) => {
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
  const service = createAuthorizedWorkflowDefinitionAdminService(database);

  try {
    const catalog = await service.getCatalog({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const noticeValue = new URL(context.req.url).searchParams.get("notice");
    const notice =
      noticeValue === "created"
        ? "Workflow definition created."
        : noticeValue === "versioned"
          ? "Workflow version created."
          : undefined;
    context.header("Cache-Control", "no-store");
    return context.html(
      renderWorkflowDefinitionAdmin(
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

app.post("/demo/app/admin/workflows/create", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Workflow Definitions.",
      },
      409,
    );
  }

  try {
    const input = parseWorkflowDefinitionInput(
      await readWorkflowFormValues(context.req.raw, [
        "name",
        "states",
        "transitions",
      ]),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    await createAuthorizedWorkflowDefinitionAdminService(database).createDefinition(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        workflowDefinitionId: `workflow-${crypto.randomUUID()}`,
        auditEventId: `workflow-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
        input,
      },
    );
    return context.redirect("/demo/app/admin/workflows?notice=created", 303);
  } catch (error) {
    if (error instanceof WorkflowDefinitionInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Workflow definition creation failed.";
    return context.text(message, 409);
  }
});

app.post("/demo/app/admin/workflows/version", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Workflow Definitions.",
      },
      409,
    );
  }

  try {
    const values = await readWorkflowFormValues(context.req.raw, [
      "workflowDefinitionId",
      "name",
      "states",
      "transitions",
    ]);
    const workflowDefinitionId = parseExistingWorkflowId(values);
    const input = parseWorkflowDefinitionInput(values);
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    await createAuthorizedWorkflowDefinitionAdminService(database).createVersion(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        workflowDefinitionId,
        auditEventId: `workflow-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
        input,
      },
    );
    return context.redirect("/demo/app/admin/workflows?notice=versioned", 303);
  } catch (error) {
    if (error instanceof WorkflowDefinitionInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Workflow version creation failed.";
    return context.text(message, 409);
  }
});

'''
if marker not in text:
    raise SystemExit("missing workflow route insertion marker")
text = text.replace(marker, routes + marker, 1)

helper_marker = '''function createAuthorizedPortableExportService(
  database: D1DatabaseProvider,
): AuthorizedPortableExportService {'''
helper = '''function createAuthorizedWorkflowDefinitionAdminService(
  database: D1DatabaseProvider,
): AuthorizedWorkflowDefinitionAdminService {
  return new AuthorizedWorkflowDefinitionAdminService(
    new WorkflowDefinitionAdminService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

'''
if helper_marker not in text:
    raise SystemExit("missing workflow service helper marker")
text = text.replace(helper_marker, helper + helper_marker, 1)

form_helper_marker = '''function safeFileSegment(value: string): string {'''
form_helper = '''async function readWorkflowFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new WorkflowDefinitionInputValidationError(
      "A valid form body is required.",
    );
  }
  const values = new URLSearchParams();
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}

'''
if form_helper_marker not in text:
    raise SystemExit("missing workflow form helper marker")
text = text.replace(form_helper_marker, form_helper + form_helper_marker, 1)
index.write_text(text)

admin_ui = Path("src/ui/render-admin-settings.ts")
ui = admin_ui.read_text()
old = '<p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
new = '<p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
if old not in ui:
    raise SystemExit("missing administration navigation marker")
admin_ui.write_text(ui.replace(old, new, 1))
