from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/index.ts",
    'import { AuthorizedReviewApprovalQueueReadService } from "./application/authorized-review-approval-queue-read-service";\n',
    'import { AuthorizedReviewApprovalQueueReadService } from "./application/authorized-review-approval-queue-read-service";\nimport { AuthorizedTemplateDetailReadService } from "./application/authorized-template-detail-read-service";\n',
)
replace_once(
    "src/index.ts",
    'import { TemplateLifecycleAdminService } from "./application/template-lifecycle-admin-service";\n',
    'import { TemplateDetailReadService, TemplateNotFoundError } from "./application/template-detail-read-service";\nimport { TemplateLifecycleAdminService } from "./application/template-lifecycle-admin-service";\n',
)
replace_once(
    "src/index.ts",
    'import { renderTemplateLifecycleAdmin } from "./ui/render-template-lifecycle-admin";\n',
    'import { renderTemplateDetail } from "./ui/render-template-detail";\nimport { renderTemplateLifecycleAdmin } from "./ui/render-template-lifecycle-admin";\n',
)

route = '''app.get("/demo/app/templates/:templateId", async (context) => {
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
  const read = createAuthorizedTemplateDetailReadService(database);

  try {
    const detail = await read.getTemplateDetail({
      subjectId: demo.authorSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
      templateId: context.req.param("templateId"),
    });
    context.header("Cache-Control", "no-store");
    return context.html(
      renderTemplateDetail(
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
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

'''
replace_once(
    "src/index.ts",
    'app.get("/demo/app/reviews", async (context) => {\n',
    route + 'app.get("/demo/app/reviews", async (context) => {\n',
)

helper = '''function createAuthorizedTemplateDetailReadService(
  database: D1DatabaseProvider,
): AuthorizedTemplateDetailReadService {
  return new AuthorizedTemplateDetailReadService(
    new TemplateDetailReadService(database),
    new DatabaseAuthorizationPolicy(database),
  );
}

'''
replace_once(
    "src/index.ts",
    'function createAuthorizedDocumentDetailReadService(\n',
    helper + 'function createAuthorizedDocumentDetailReadService(\n',
)

replace_once(
    "src/ui/render-workspace-app.ts",
    '              ${template.contentHash ? `<p class="hash">${escapeHtml(shortHash(template.contentHash))}</p>` : ""}\n            </article>',
    '              ${template.contentHash ? `<p class="hash">${escapeHtml(shortHash(template.contentHash))}</p>` : ""}\n              <a class="text-link" href="/demo/app/templates/${encodeURIComponent(template.id)}">View template evidence</a>\n            </article>',
)

replace_once(
    "README.md",
    '- workspace overview, Documents, Templates, queue-native Reviews & Approvals actions, Audit Log, bounded search/filtering, and bounded CSV audit evidence export;',
    '- workspace overview, Documents, Templates with immutable version evidence, queue-native Reviews & Approvals actions, Audit Log, bounded search/filtering, and bounded CSV audit evidence export;',
)
replace_once(
    "README.md",
    '- Templates are controlled/versioned records with lifecycle and provenance metadata. A Template Manager may create a sequential immutable Draft revision from any exact historical version when intentionally reusing the same content identity; the source SHA-256/provider/key are copied unchanged and derivation is recorded in provenance/audit.\n',
    '- Templates are controlled/versioned records with lifecycle and provenance metadata. A Template Manager may create a sequential immutable Draft revision from any exact historical version when intentionally reusing the same content identity; the source SHA-256/provider/key are copied unchanged and derivation is recorded in provenance/audit.\n- Authorized template readers can inspect every immutable version, lifecycle state, exact SHA-256 identity, provenance, creator display name, and lifecycle timestamp without receiving storage keys, internal creator subject IDs, or lifecycle mutation controls.\n',
)

replace_once(
    "docs/HANDOFF.md",
    '- workspace Overview, Documents, Templates, document evidence with versioned JSON manifest export, and queue-native Reviews & Approvals actions;\n',
    '- workspace Overview, Documents, Templates with read-only immutable version evidence, document evidence with versioned JSON manifest export, and queue-native Reviews & Approvals actions;\n',
)

template_boundary = '''## Controlled template evidence boundary

- Ordinary authorized template readers can open `/demo/app/templates/:templateId` from the normal Templates list and inspect the immutable version lineage without entering Template Lifecycle administration.
- The read path requires existing workspace-scoped `template.read` and remains tenant/workspace/template bounded; authorization denial and not-found use the same 404 response.
- Evidence includes exact version number, lifecycle state, SHA-256 identity, provenance, creator display name, creation timestamp, published/superseded timestamps, and the current-version marker.
- Content provider/key values, creator subject IDs, audit payloads, document-usage records, and unrelated tenant/workspace records are deliberately excluded from this view.
- This surface is read-only. Lifecycle mutation remains in the separately authorized Template Lifecycle administration service and no new mutation path is introduced.
- The template evidence page is not a binary download, template export, upload/content-replacement flow, retention/archive mechanism, or production integration.

'''
replace_once(
    "docs/HANDOFF.md",
    '## Controlled document retirement\n',
    template_boundary + '## Controlled document retirement\n',
)

status_section = '''### Controlled template evidence detail (synthetic/test only)

- The ordinary Templates list links each controlled template to a read-only `/demo/app/templates/:templateId` evidence view.
- `TemplateDetailReadService` returns the complete immutable version lineage newest-first, including exact version number, lifecycle state, SHA-256 identity, provenance, creator display name, lifecycle timestamps, and current-version status.
- `AuthorizedTemplateDetailReadService` requires existing workspace-scoped `template.read` before persistence executes; the query independently constrains tenant, workspace, and template ID.
- Storage provider/key metadata, creator subject IDs, audit payloads, document usage, and unrelated records are not projected into the evidence model.
- Authorization denial and cross-session/wrong-workspace template IDs use the same not-found response, preserving synthetic tenant/session isolation.
- This slice adds no schema migration, lifecycle mutation, template upload/content replacement, binary download/export, production authentication, Cloudflare resources, analytics, or paid services.

'''
replace_once(
    "docs/STATUS.md",
    '### Authorized document detail and evidence (synthetic/test only)\n',
    status_section + '### Authorized document detail and evidence (synthetic/test only)\n',
)
