from pathlib import Path

index_path = Path("src/index.ts")
text = index_path.read_text()

marker = 'import { AuthorizedPresentationSettingsService } from "./application/authorized-presentation-settings-service";'
replacement = marker + '\nimport { AuthorizedMemberAdminService } from "./application/authorized-member-admin-service";'
if marker not in text:
    raise SystemExit("authorized presentation import marker missing")
text = text.replace(marker, replacement, 1)

marker = 'import { PortableExportReadService } from "./application/portable-export-read-service";'
replacement = '''import { PortableExportReadService } from "./application/portable-export-read-service";
import {
  parseDirectMemberInput,
  parseMembershipTransitionInput,
  MemberAdminInputValidationError,
} from "./application/member-admin-input";
import { MemberAdminService } from "./application/member-admin-service";'''
if marker not in text:
    raise SystemExit("portable export import marker missing")
text = text.replace(marker, replacement, 1)

marker = 'import { renderGuidedDemo } from "./ui/render-guided-demo";'
replacement = marker + '\nimport { renderMemberAdmin } from "./ui/render-member-admin";'
if marker not in text:
    raise SystemExit("guided demo render import marker missing")
text = text.replace(marker, replacement, 1)

routes = r'''

app.get("/demo/app/admin/members", async (context) => {
  if (!guidedDemoEnabled(context.env)) {
    return context.html(renderNotFound(createTheme(context.env)), 404);
  }
  const session = resolveGuidedDemoSession(
    context.req.header("Cookie"),
    context.req.url,
  );
  if (session.setCookie) context.header("Set-Cookie", session.setCookie);
  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
  const demo = createGuidedDemoContext(session.sessionId);
  await ensureGuidedDemoSeed(database, session.sessionId);
  const admin = await ensureGuidedTenantAdmin(database, session.sessionId);
  const service = createAuthorizedMemberAdminService(database);

  try {
    const directory = await service.getDirectory({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const noticeValue = new URL(context.req.url).searchParams.get("notice");
    const notice =
      noticeValue === "created"
        ? "Tenant member added."
        : noticeValue === "activated"
          ? "Membership activated."
          : noticeValue === "suspended"
            ? "Membership suspended."
            : undefined;
    context.header("Cache-Control", "no-store");
    return context.html(
      renderMemberAdmin(
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
        directory,
        admin.subjectId,
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

app.post("/demo/app/admin/members/create", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Members.",
      },
      409,
    );
  }

  try {
    const input = parseDirectMemberInput(
      await readMemberFormValues(context.req.raw, [
        "displayName",
        "email",
        "initialStatus",
      ]),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    const memberUuid = crypto.randomUUID();
    await createAuthorizedMemberAdminService(database).createDirectMember(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        membershipId: `membership-local-${memberUuid}`,
        subjectId: `subject-local-${memberUuid}`,
        providerSubject: `local-${memberUuid}`,
        displayName: input.displayName,
        email: input.email,
        initialStatus: input.initialStatus,
        auditEventId: `membership-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      },
    );
    return context.redirect("/demo/app/admin/members?notice=created", 303);
  } catch (error) {
    if (error instanceof MemberAdminInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    return context.text(
      error instanceof Error ? error.message : "Tenant member creation failed.",
      409,
    );
  }
});

app.post("/demo/app/admin/members/status", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
    return context.json({ error: "Same-origin demo request required." }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
  if (!sessionId) {
    return context.json(
      {
        error:
          "Synthetic administration session missing. Reload Members.",
      },
      409,
    );
  }

  try {
    const input = parseMembershipTransitionInput(
      await readMemberFormValues(context.req.raw, [
        "membershipId",
        "targetStatus",
      ]),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    await createAuthorizedMemberAdminService(database).transitionMembership(
      {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      },
      {
        membershipId: input.membershipId,
        targetStatus: input.targetStatus,
        auditEventId: `membership-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      },
    );
    return context.redirect(
      `/demo/app/admin/members?notice=${input.targetStatus === "active" ? "activated" : "suspended"}`,
      303,
    );
  } catch (error) {
    if (error instanceof MemberAdminInputValidationError) {
      return context.text(error.message, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    return context.text(
      error instanceof Error ? error.message : "Membership status change failed.",
      409,
    );
  }
});
'''
route_marker = 'app.get("/demo/app/admin/access", async (context) => {'
if route_marker not in text:
    raise SystemExit("roles access route marker missing")
text = text.replace(route_marker, routes + "\n" + route_marker, 1)

factory_marker = '''function createAuthorizedRolesAccessAdminService(
  database: D1DatabaseProvider,
): AuthorizedRolesAccessAdminService {'''
factory = '''function createAuthorizedMemberAdminService(
  database: D1DatabaseProvider,
): AuthorizedMemberAdminService {
  return new AuthorizedMemberAdminService(
    new MemberAdminService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

'''
if factory_marker not in text:
    raise SystemExit("roles factory marker missing")
text = text.replace(factory_marker, factory + factory_marker, 1)

helper_marker = 'async function readRoleDefinitionFormValues('
helper = '''async function readMemberFormValues(
  request: Request,
  keys: readonly string[],
): Promise<URLSearchParams> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new MemberAdminInputValidationError("A valid form body is required.");
  }
  const values = new URLSearchParams();
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values.set(key, value);
  }
  return values;
}

'''
if helper_marker not in text:
    raise SystemExit("role form helper marker missing")
text = text.replace(helper_marker, helper + helper_marker, 1)
index_path.write_text(text)

settings_path = Path("src/ui/render-admin-settings.ts")
settings = settings_path.read_text()
old_links = '<p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/workflow-selection">Workflow Selection</a> · <a href="/demo/app/admin/templates">Template Lifecycle</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
new_links = '<p><a href="/demo/app/admin/members"><strong>Manage Members</strong></a> · <a href="/demo/app/admin/access">Roles &amp; Access</a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/workflow-selection">Workflow Selection</a> · <a href="/demo/app/admin/templates">Template Lifecycle</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>'
if old_links not in settings:
    raise SystemExit("admin settings links marker missing")
settings_path.write_text(settings.replace(old_links, new_links, 1))
