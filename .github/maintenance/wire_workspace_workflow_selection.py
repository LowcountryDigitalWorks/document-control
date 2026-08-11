from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing {label} marker")
    return text.replace(old, new, 1)


index_path = Path("src/index.ts")
index = index_path.read_text()
index = replace_once(
    index,
    'import { AuthorizedWorkflowDefinitionAdminService } from "./application/authorized-workflow-definition-admin-service";\n',
    'import { AuthorizedWorkflowDefinitionAdminService } from "./application/authorized-workflow-definition-admin-service";\nimport { AuthorizedWorkspaceWorkflowSelectionService } from "./application/authorized-workspace-workflow-selection-service";\n',
    "authorized workflow selection import",
)
index = replace_once(
    index,
    'import { WorkflowDefinitionAdminService } from "./application/workflow-definition-admin-service";\n',
    'import { WorkflowDefinitionAdminService } from "./application/workflow-definition-admin-service";\nimport { WorkspaceWorkflowSelectionService } from "./application/workspace-workflow-selection-service";\nimport {\n  parseWorkspaceWorkflowSelectionInput,\n  WorkspaceWorkflowSelectionInputValidationError,\n} from "./application/workspace-workflow-selection-input";\n',
    "workflow selection service imports",
)
index = replace_once(
    index,
    'import { renderWorkflowDefinitionAdmin } from "./ui/render-workflow-definition-admin";\n',
    'import { renderWorkflowDefinitionAdmin } from "./ui/render-workflow-definition-admin";\nimport { renderWorkspaceWorkflowSelection } from "./ui/render-workspace-workflow-selection";\n',
    "workflow selection renderer import",
)

route_marker = 'app.get("/demo/app/admin/templates", async (context) => {'
routes = '''app.get("/demo/app/admin/workflow-selection", async (context) => {
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
  const service = createAuthorizedWorkspaceWorkflowSelectionService(database);

  try {
    const catalog = await service.getCatalog({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const noticeValue = new URL(context.req.url).searchParams.get("notice");
    const notice =
      noticeValue === "enabled"
        ? "Workflow version made available to this workspace."
        : noticeValue === "disabled"
          ? "Workflow version removed from this workspace."
          : noticeValue === "default"
            ? "Workspace default workflow changed."
            : noticeValue === "unchanged"
              ? "No workflow selection change was needed."
              : undefined;
    context.header("Cache-Control", "no-store");
    return context.html(
      renderWorkspaceWorkflowSelection(
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

app.post("/demo/app/admin/workflow-selection/update", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Workflow Selection.",
      },
      409,
    );
  }

  try {
    const input = parseWorkspaceWorkflowSelectionInput(
      await readWorkflowSelectionFormValues(context.req.raw),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    const service = createAuthorizedWorkspaceWorkflowSelectionService(database);
    const authContext = {
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    };
    const baseCommand = {
      workflowDefinitionId: input.workflowDefinitionId,
      workflowDefinitionVersion: input.workflowDefinitionVersion,
      auditEventId: `workflow-selection-audit-${crypto.randomUUID()}`,
      occurredAt: new Date().toISOString(),
    };

    let result: { changed: boolean };
    if (input.action === "default") {
      result = await service.setDefault(authContext, baseCommand);
    } else {
      result = await service.setApplicability(authContext, {
        ...baseCommand,
        applicable: input.action === "enable",
      });
    }
    const notice = result.changed
      ? input.action === "enable"
        ? "enabled"
        : input.action === "disable"
          ? "disabled"
          : "default"
      : "unchanged";
    return context.redirect(
      `/demo/app/admin/workflow-selection?notice=${notice}`,
      303,
    );
  } catch (error) {
    if (error instanceof WorkspaceWorkflowSelectionInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const message =
      error instanceof Error ? error.message : "Workflow selection update failed.";
    return context.text(message, 409);
  }
});

'''
index = replace_once(index, route_marker, routes + route_marker, "workflow selection routes")

helper_marker = '''function createAuthorizedTemplateLifecycleAdminService(
  database: D1DatabaseProvider,
): AuthorizedTemplateLifecycleAdminService {'''
helper = '''function createAuthorizedWorkspaceWorkflowSelectionService(
  database: D1DatabaseProvider,
): AuthorizedWorkspaceWorkflowSelectionService {
  return new AuthorizedWorkspaceWorkflowSelectionService(
    new WorkspaceWorkflowSelectionService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

'''
index = replace_once(index, helper_marker, helper + helper_marker, "workflow selection helper")

form_marker = '''async function readTemplateLifecycleFormValues(
  request: Request,
): Promise<URLSearchParams> {'''
form_helper = '''async function readWorkflowSelectionFormValues(
  request: Request,
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new WorkspaceWorkflowSelectionInputValidationError(
      "A valid form body is required.",
    );
  }
  const values = new URLSearchParams();
  for (const key of [
    "workflowDefinitionId",
    "workflowDefinitionVersion",
    "action",
  ]) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}

'''
index = replace_once(index, form_marker, form_helper + form_marker, "workflow selection form helper")
index_path.write_text(index)

admin_path = Path("src/ui/render-admin-settings.ts")
admin = admin_path.read_text()
old_admin_link = '<a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/templates">Template Lifecycle</a>'
new_admin_link = '<a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/workflow-selection">Workflow Selection</a> · <a href="/demo/app/admin/templates">Template Lifecycle</a>'
admin = replace_once(admin, old_admin_link, new_admin_link, "administration workflow selection link")
admin_path.write_text(admin)

workflow_ui_path = Path("src/ui/render-workflow-definition-admin.ts")
workflow_ui = workflow_ui_path.read_text()
workflow_ui = replace_once(
    workflow_ui,
    '<p class="lede">Create a new tenant workflow family or append a new immutable version. Existing workflow instances stay bound to the exact definition version they started with.</p>',
    '<p class="lede">Create a new tenant workflow family or append a new immutable version. Existing workflow instances stay bound to the exact definition version they started with.</p>\n      <p><a href="/demo/app/admin/workflow-selection">Configure workspace applicability and default selection</a></p>',
    "workflow definition selection link",
)
workflow_ui_path.write_text(workflow_ui)

workflow_path = Path("src/demo/workflow-demo.ts")
workflow = workflow_path.read_text()
workflow = replace_once(
    workflow,
    'import type { DatabaseProvider } from "../application/ports";\n',
    'import type { DatabaseProvider } from "../application/ports";\nimport { WorkspaceWorkflowSelectionService } from "../application/workspace-workflow-selection-service";\n',
    "guided workflow selection import",
)
seed_marker = '''  ]);
}

export async function loadGuidedDemoState'''
seed_assignment = '''    statement(
      `INSERT OR IGNORE INTO workspace_workflow_assignments
         (tenant_id, workspace_id, workflow_definition_id,
          workflow_definition_version, is_default,
          created_by_subject_id, created_at, updated_by_subject_id, updated_at)
       VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?)`,
      [
        demo.tenantId,
        demo.workspaceId,
        demo.workflowDefinitionId,
        demo.authorSubjectId,
        seedTimestamp,
        demo.authorSubjectId,
        seedTimestamp,
      ],
    ),
  ]);
}

export async function loadGuidedDemoState'''
workflow = replace_once(workflow, seed_marker, seed_assignment, "guided default seed")
submit_old = '''  } else if (action === "submit") {
    await service.startWorkflow({
      tenantId: demo.tenantId,
      documentId: demo.documentId,
      workflowInstanceId: demo.workflowInstanceId,
      workflowDefinitionId: demo.workflowDefinitionId,
      workflowDefinitionVersion: 1,
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-workflow-started"),
    });'''
submit_new = '''  } else if (action === "submit") {
    const selectedWorkflow = await new WorkspaceWorkflowSelectionService(
      database,
    ).resolveDefault(demo.tenantId, demo.workspaceId);
    await service.startWorkflow({
      tenantId: demo.tenantId,
      documentId: demo.documentId,
      workflowInstanceId: demo.workflowInstanceId,
      workflowDefinitionId: selectedWorkflow.workflowDefinitionId,
      workflowDefinitionVersion: selectedWorkflow.workflowDefinitionVersion,
      actorSubjectId: demo.authorSubjectId,
      occurredAt,
      auditEventId: id("audit-workflow-started"),
    });'''
workflow = replace_once(workflow, submit_old, submit_new, "guided default resolution")
workflow_path.write_text(workflow)
