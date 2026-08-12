from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# Database invariants: sequential versions, one open Draft/Review, and current revision cannot roll back.
Path("migrations/0009_template_revision_linearity.sql").write_text("""-- Template revision creation remains immutable and linear.
-- New revision content may initially reuse an exact historical content identity, but the
-- version record itself is still immutable once inserted.

CREATE TRIGGER template_versions_linear_insert
BEFORE INSERT ON template_versions
WHEN NEW.version_number <> COALESCE(
  (
    SELECT MAX(version_number) + 1
    FROM template_versions
    WHERE tenant_id = NEW.tenant_id
      AND template_id = NEW.template_id
  ),
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Template versions must be created in sequence.');
END;

CREATE TRIGGER template_versions_single_open_revision
BEFORE INSERT ON template_versions
WHEN NEW.lifecycle_state IN ('draft', 'review')
  AND EXISTS (
    SELECT 1
    FROM template_versions
    WHERE tenant_id = NEW.tenant_id
      AND template_id = NEW.template_id
      AND lifecycle_state IN ('draft', 'review')
  )
BEGIN
  SELECT RAISE(ABORT, 'A template can have only one open Draft or Review revision.');
END;

CREATE TRIGGER templates_current_version_latest_only
BEFORE UPDATE OF current_version ON templates
WHEN
  (OLD.current_version IS NOT NULL AND NEW.current_version IS NULL)
  OR (
    NEW.current_version IS NOT NULL
    AND NEW.current_version <> (
      SELECT MAX(version_number)
      FROM template_versions
      WHERE tenant_id = NEW.tenant_id
        AND template_id = NEW.id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Template current revision must reference the latest version.');
END;
""")

# Input: exact source version + a bounded reason + explicit acknowledgement that content is unchanged.
path = "src/application/template-lifecycle-input.ts"
replace_once(
    path,
    "export function parseTemplateLifecycleInput(values: URLSearchParams): {\n",
    """export function parseTemplateRevisionInput(values: URLSearchParams): {
  sourceTemplateVersionId: string;
  revisionNote: string;
} {
  const sourceTemplateVersionId = (
    values.get(\"sourceTemplateVersionId\") ?? \"\"
  ).trim();
  assertTemplateVersionIdentifier(sourceTemplateVersionId, \"Source template version\");

  const revisionNote = (values.get(\"revisionNote\") ?? \"\").trim();
  if (revisionNote.length < 3 || revisionNote.length > 500) {
    throw new TemplateLifecycleInputValidationError(
      \"Revision note must be between 3 and 500 characters.\",
    );
  }

  if (values.get(\"confirmUnchangedContent\") !== \"confirmed\") {
    throw new TemplateLifecycleInputValidationError(
      \"Confirm that this draft revision reuses the exact existing content identity.\",
    );
  }

  return { sourceTemplateVersionId, revisionNote };
}

export function parseTemplateLifecycleInput(values: URLSearchParams): {
""",
)
replace_once(
    path,
    """  const templateVersionId = (values.get(\"templateVersionId\") ?? \"\").trim();
  if (!templateVersionId) {
    throw new TemplateLifecycleInputValidationError(
      \"Template version is required.\",
    );
  }
  if (
    templateVersionId.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/u.test(templateVersionId)
  ) {
    throw new TemplateLifecycleInputValidationError(
      \"Template version identifier is invalid.\",
    );
  }
""",
    """  const templateVersionId = (values.get(\"templateVersionId\") ?? \"\").trim();
  assertTemplateVersionIdentifier(templateVersionId, \"Template version\");
""",
)
Path(path).write_text(Path(path).read_text() + """

function assertTemplateVersionIdentifier(value: string, label: string): void {
  if (!value) {
    throw new TemplateLifecycleInputValidationError(`${label} is required.`);
  }
  if (value.length > 256 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new TemplateLifecycleInputValidationError(
      `${label} identifier is invalid.`,
    );
  }
}
""")

# Service: exact-version unchanged-content clone into a new immutable Draft revision.
path = "src/application/template-lifecycle-admin-service.ts"
replace_once(
    path,
    """export interface TransitionTemplateVersionCommand {
  tenantId: string;
  workspaceId: string;
  templateVersionId: string;
  targetState: TemplateLifecycleState;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}
""",
    """export interface TransitionTemplateVersionCommand {
  tenantId: string;
  workspaceId: string;
  templateVersionId: string;
  targetState: TemplateLifecycleState;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}

export interface CreateTemplateRevisionCommand {
  tenantId: string;
  workspaceId: string;
  sourceTemplateVersionId: string;
  templateVersionId: string;
  revisionNote: string;
  actorSubjectId: string;
  auditEventId: string;
  occurredAt: string;
}
""",
)
marker = """  private async loadWorkspace(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceRow> {
"""
method = """  public async createRevision(
    command: CreateTemplateRevisionCommand,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.loadWorkspace(command.tenantId, command.workspaceId);
    const [source] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.sourceTemplateVersionId],
    );
    if (!source) {
      throw new Error(
        \"Source template version was not found in the requested workspace.\",
      );
    }

    const [openRevision] = await this.database.query<{ id: string }>(
      `SELECT version.id
       FROM template_versions version
       JOIN templates template
         ON template.id = version.template_id
        AND template.tenant_id = version.tenant_id
       WHERE version.tenant_id = ?
         AND template.workspace_id = ?
         AND version.template_id = ?
         AND version.lifecycle_state IN ('draft', 'review')
       LIMIT 1`,
      [command.tenantId, command.workspaceId, source.templateId],
    );
    if (openRevision) {
      throw new Error(
        \"Complete or retire the current Draft/Review template revision before creating another.\",
      );
    }

    const [sequence] = await this.database.query<{ nextVersion: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS nextVersion
       FROM template_versions
       WHERE tenant_id = ? AND template_id = ?`,
      [command.tenantId, source.templateId],
    );
    const nextVersion = Number(sequence?.nextVersion ?? 1);
    const provenance =
      `Derived from exact template version ${source.versionNumber} (${source.id}); ` +
      `content identity unchanged from ${source.contentHash}. Revision note: ${command.revisionNote}`;

    await this.database.executeBatch([
      statement(
        `INSERT INTO template_versions
           (id, tenant_id, template_id, version_number, lifecycle_state,
            content_hash, content_provider, content_key, created_by_subject_id,
            provenance, created_at, published_at, superseded_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          command.templateVersionId,
          command.tenantId,
          source.templateId,
          nextVersion,
          source.contentHash,
          source.contentProvider,
          source.contentKey,
          command.actorSubjectId,
          provenance,
          command.occurredAt,
        ],
      ),
      statement(
        `UPDATE templates
         SET current_version = ?
         WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
        [
          nextVersion,
          source.templateId,
          command.tenantId,
          command.workspaceId,
        ],
      ),
      revisionAuditStatement({
        id: command.auditEventId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        actorSubjectId: command.actorSubjectId,
        entityId: command.templateVersionId,
        occurredAt: command.occurredAt,
        payload: {
          templateId: source.templateId,
          versionNumber: nextVersion,
          sourceTemplateVersionId: source.id,
          sourceVersionNumber: source.versionNumber,
          contentHash: source.contentHash,
          contentIdentityReused: true,
          revisionNote: command.revisionNote,
        },
      }),
    ]);

    const [created] = await this.database.query<TemplateVersionRow>(
      templateVersionSelect(
        `WHERE version.tenant_id = ?
           AND template.workspace_id = ?
           AND version.id = ?`,
      ),
      [command.tenantId, command.workspaceId, command.templateVersionId],
    );
    if (!created) {
      throw new Error(\"Created template revision could not be reloaded.\");
    }
    return mapVersionRow(created);
  }

"""
replace_once(path, marker, method + marker)
Path(path).write_text(Path(path).read_text() + """

function revisionAuditStatement(input: {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  entityId: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}): DatabaseStatement {
  return {
    sql: `INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_subject_id, event_type,
             entity_type, entity_id, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, 'template.version.created',
                  'template_version', ?, ?, ?)`,
    parameters: [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.actorSubjectId,
      input.entityId,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  };
}
""")

# Authorization wrapper uses the existing template.manage boundary.
path = "src/application/authorized-template-lifecycle-admin-service.ts"
replace_once(
    path,
    """  TemplateLifecycleAdminService,
  TemplateLifecycleCatalog,
  TemplateLifecycleVersionRecord,
  TransitionTemplateVersionCommand,
""",
    """  CreateTemplateRevisionCommand,
  TemplateLifecycleAdminService,
  TemplateLifecycleCatalog,
  TemplateLifecycleVersionRecord,
  TransitionTemplateVersionCommand,
""",
)
marker = """  public async transitionVersion(
    context: TemplateLifecycleAuthorizationContext,
"""
method = """  public async createRevision(
    context: TemplateLifecycleAuthorizationContext,
    command: Omit<
      CreateTemplateRevisionCommand,
      \"tenantId\" | \"workspaceId\" | \"actorSubjectId\"
    >,
  ): Promise<TemplateLifecycleVersionRecord> {
    await this.assertTemplateManagementAllowed(context);
    return this.templates.createRevision({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

"""
replace_once(path, marker, method + marker)

# UI: keep lifecycle controls and add unchanged-content Draft revision creation from exact versions.
path = "src/ui/render-template-lifecycle-admin.ts"
replace_once(
    path,
    """      <p class=\"lede\">Move existing template versions through the controlled lifecycle without changing their content identity or provenance. Documents already created from a version keep their exact source template ID, version, and hash.</p>
""",
    """      <p class=\"lede\">Control existing template lifecycles and create a new immutable Draft revision from any exact historical version. An unchanged-content revision reuses the source hash and content reference; it does not claim that a binary was edited or uploaded.</p>
""",
)
replace_once(
    path,
    """      <p class=\"eyebrow\">Integrity boundary</p><h2 id=\"boundary-title\">Lifecycle only</h2>
      <ul>
        <li>Template binaries/content references are not uploaded or replaced on this screen.</li>
        <li>Version number, SHA-256, storage provider/key, creator, provenance, and creation timestamp are database-immutable.</li>
        <li>Allowed lifecycle: Draft → Review → Approved → Published → Superseded → Retired, with the documented return/retire branches.</li>
        <li>Published or approved templates may be used to create documents; superseded/retired versions remain historical evidence.</li>
        <li>Every lifecycle transition is appended to the existing audit stream.</li>
      </ul>
""",
    """      <p class=\"eyebrow\">Integrity boundary</p><h2 id=\"boundary-title\">Immutable revisions</h2>
      <ul>
        <li>Template binaries/content references are not uploaded, edited, or replaced on this screen.</li>
        <li>A new Draft revision can be derived from any exact historical version, but it reuses that version's SHA-256, provider, and content key unchanged.</li>
        <li>Only one Draft/Review revision may be open in a template family at a time, and revisions advance sequentially.</li>
        <li>Version number, SHA-256, storage provider/key, creator, provenance, and creation timestamp remain database-immutable after creation.</li>
        <li>Published or approved templates may be used to create documents; superseded/retired versions remain historical evidence.</li>
        <li>Revision creation and lifecycle transitions append evidence to the audit stream.</li>
      </ul>
""",
)
replace_once(
    path,
    """      ${catalog.versions.length === 0 ? '<p class=\"empty\">No controlled template versions are recorded in this workspace.</p>' : `<div class=\"version-list\">${catalog.versions.map((version) => renderVersion(version)).join(\"\")}</div>`}
""",
    """      ${catalog.versions.length === 0 ? '<p class=\"empty\">No controlled template versions are recorded in this workspace.</p>' : `<div class=\"version-list\">${catalog.versions.map((version) => renderVersion(version, catalog)).join(\"\")}</div>`}
""",
)
replace_once(
    path,
    """function renderVersion(
  version: TemplateLifecycleCatalog[\"versions\"][number],
): string {
  return `<article class=\"version-card\">
""",
    """function renderVersion(
  version: TemplateLifecycleCatalog[\"versions\"][number],
  catalog: TemplateLifecycleCatalog,
): string {
  const openRevision = catalog.versions.find(
    (candidate) =>
      candidate.templateId === version.templateId &&
      (candidate.lifecycleState === \"draft\" || candidate.lifecycleState === \"review\"),
  );
  const revisionControl = openRevision
    ? version.isCurrent
      ? `<p class=\"revision-note\"><strong>Revision in progress:</strong> v${openRevision.versionNumber} is ${escapeHtml(labelState(openRevision.lifecycleState))}. Complete or retire it before creating another Draft revision.</p>`
      : \"\"
    : `<form method=\"post\" action=\"/demo/app/admin/templates/revisions\" class=\"revision-form\">
        <input type=\"hidden\" name=\"sourceTemplateVersionId\" value=\"${escapeHtml(version.id)}\">
        <p><strong>Create from exact v${version.versionNumber}</strong> — copies this version's SHA-256, provider, and content key unchanged into a new immutable Draft revision.</p>
        <label>Revision note <textarea name=\"revisionNote\" rows=\"2\" maxlength=\"500\" required placeholder=\"Why is this unchanged-content revision being created?\"></textarea></label>
        <label class=\"checkbox\"><input type=\"checkbox\" name=\"confirmUnchangedContent\" value=\"confirmed\" required> I confirm no binary/content change is being represented by this revision.</label>
        <button type=\"submit\">Create draft revision</button>
      </form>`;
  return `<article class=\"version-card\">
""",
)
replace_once(
    path,
    """    ${version.availableTransitions.length === 0 ? '<p class=\"empty\">No further lifecycle transitions are available.</p>' : `<form method=\"post\" action=\"/demo/app/admin/templates/transition\" class=\"transition-form\"><input type=\"hidden\" name=\"templateVersionId\" value=\"${escapeHtml(version.id)}\"><label>Move to <select name=\"targetState\" required>${version.availableTransitions.map((state) => `<option value=\"${escapeHtml(state)}\">${escapeHtml(labelState(state))}</option>`).join(\"\")}</select></label><button type=\"submit\">Apply lifecycle transition</button></form>`}
  </article>`;
""",
    """    ${version.availableTransitions.length === 0 ? '<p class=\"empty\">No further lifecycle transitions are available.</p>' : `<form method=\"post\" action=\"/demo/app/admin/templates/transition\" class=\"transition-form\"><input type=\"hidden\" name=\"templateVersionId\" value=\"${escapeHtml(version.id)}\"><label>Move to <select name=\"targetState\" required>${version.availableTransitions.map((state) => `<option value=\"${escapeHtml(state)}\">${escapeHtml(labelState(state))}</option>`).join(\"\")}</select></label><button type=\"submit\">Apply lifecycle transition</button></form>`}
    ${revisionControl}
  </article>`;
""",
)
replace_once(
    path,
    ".transition-form{display:flex;align-items:end;gap:1rem;margin-top:1rem}.transition-form label{display:grid;gap:.35rem;font-weight:750;color:var(--brand-primary);min-width:min(260px,100%)}select,button{min-height:44px;border-radius:10px;font:inherit}select{border:1px solid var(--border);background:var(--raised);color:var(--text);padding:.55rem .7rem}button{border:0;background:var(--brand-primary);color:white;font-weight:800;padding:.6rem 1rem;cursor:pointer}.empty{color:var(--muted)}",
    ".transition-form{display:flex;align-items:end;gap:1rem;margin-top:1rem}.transition-form label{display:grid;gap:.35rem;font-weight:750;color:var(--brand-primary);min-width:min(260px,100%)}.revision-form{display:grid;gap:.7rem;border-top:1px solid var(--border);margin-top:1rem;padding-top:1rem}.revision-form p,.revision-note{margin:.1rem 0;color:var(--muted)}.revision-form label{display:grid;gap:.35rem;font-weight:750;color:var(--brand-primary)}.revision-form .checkbox{display:flex;align-items:flex-start;gap:.55rem;font-weight:650;color:var(--text)}.revision-form .checkbox input{margin-top:.25rem;flex:0 0 auto}.revision-form button{justify-self:start}textarea,select,button{min-height:44px;border-radius:10px;font:inherit}textarea,select{border:1px solid var(--border);background:var(--raised);color:var(--text);padding:.55rem .7rem}textarea{width:100%;resize:vertical}button{border:0;background:var(--brand-primary);color:white;font-weight:800;padding:.6rem 1rem;cursor:pointer}.empty{color:var(--muted)}",
)
replace_once(
    path,
    ".wordmark strong,.intro h1,.boundary h2,.panel h2,.transition-form label{color:#f1f5f2}",
    ".wordmark strong,.intro h1,.boundary h2,.panel h2,.transition-form label,.revision-form label{color:#f1f5f2}",
)

# Routes and notices.
path = "src/index.ts"
replace_once(
    path,
    """import {
  parseTemplateLifecycleInput,
  TemplateLifecycleInputValidationError,
} from \"./application/template-lifecycle-input\";
""",
    """import {
  parseTemplateLifecycleInput,
  parseTemplateRevisionInput,
  TemplateLifecycleInputValidationError,
} from \"./application/template-lifecycle-input\";
""",
)
replace_once(
    path,
    """    const notice =
      new URL(context.req.url).searchParams.get(\"notice\") === \"transitioned\"
        ? \"Template lifecycle transition recorded.\"
        : undefined;
""",
    """    const noticeValue = new URL(context.req.url).searchParams.get(\"notice\");
    const notice =
      noticeValue === \"transitioned\"
        ? \"Template lifecycle transition recorded.\"
        : noticeValue === \"revision-created\"
          ? \"Template Draft revision created from exact historical content identity.\"
          : undefined;
""",
)
route_marker = """app.post(\"/demo/app/admin/templates/transition\", async (context) => {
"""
route = """app.post(\"/demo/app/admin/templates/revisions\", async (context) => {
  if (!guidedDemoEnabled(context.env)) return context.notFound();
  if (!hasSameOrigin(context.req.url, context.req.header(\"Origin\"))) {
    return context.json({ error: \"Same-origin demo request required.\" }, 403);
  }
  const sessionId = readGuidedDemoSession(context.req.header(\"Cookie\"));
  if (!sessionId) {
    return context.json(
      {
        error:
          \"Synthetic administration session missing. Reload Template Lifecycle.\",
      },
      409,
    );
  }

  try {
    const input = parseTemplateRevisionInput(
      await readTemplateLifecycleFormValues(context.req.raw),
    );
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const manager = await ensureGuidedTemplateManager(database, sessionId);
    await createAuthorizedTemplateLifecycleAdminService(database).createRevision(
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
      \"/demo/app/admin/templates?notice=revision-created\",
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
      error instanceof Error ? error.message : \"Template revision creation failed.\",
      409,
    );
  }
});

"""
replace_once(path, route_marker, route + route_marker)
replace_once(
    path,
    """  for (const key of [\"templateVersionId\", \"targetState\"]) {
""",
    """  for (const key of [
    \"templateVersionId\",
    \"targetState\",
    \"sourceTemplateVersionId\",
    \"revisionNote\",
    \"confirmUnchangedContent\",
  ]) {
""",
)

# Unit input coverage.
path = "tests/unit/template-lifecycle-input.test.ts"
replace_once(
    path,
    'import { parseTemplateLifecycleInput } from "../../src/application/template-lifecycle-input";\n',
    'import {\n  parseTemplateLifecycleInput,\n  parseTemplateRevisionInput,\n} from "../../src/application/template-lifecycle-input";\n',
)
replace_once(
    path,
    """});
""",
    """
  it(\"accepts an exact source version only with a bounded revision note and unchanged-content confirmation\", () => {
    expect(
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: \"template-version:1\",
          revisionNote: \"Annual unchanged-content reissue\",
          confirmUnchangedContent: \"confirmed\",
        }),
      ),
    ).toEqual({
      sourceTemplateVersionId: \"template-version:1\",
      revisionNote: \"Annual unchanged-content reissue\",
    });
  });

  it(\"rejects invalid or unconfirmed template revision input\", () => {
    expect(() => parseTemplateRevisionInput(new URLSearchParams())).toThrow(
      \"Source template version is required.\",
    );
    expect(() =>
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: \"template-version-1\",
          revisionNote: \"ok\",
          confirmUnchangedContent: \"confirmed\",
        }),
      ),
    ).toThrow(\"Revision note must be between 3 and 500 characters.\");
    expect(() =>
      parseTemplateRevisionInput(
        new URLSearchParams({
          sourceTemplateVersionId: \"template-version-1\",
          revisionNote: \"Annual reissue\",
        }),
      ),
    ).toThrow(
      \"Confirm that this draft revision reuses the exact existing content identity.\",
    );
  });
});
""",
)

# Service tests: include new migration and prove exact-content clone + DB linearity.
path = "tests/unit/template-lifecycle-admin-service.test.ts"
replace_once(
    path,
    """    \"0004_template_version_lifecycle_integrity.sql\",
  ]) {
""",
    """    \"0004_template_version_lifecycle_integrity.sql\",
    \"0009_template_revision_linearity.sql\",
  ]) {
""",
)
insert_marker = """  it(\"rejects direct content identity changes, deletion, and invalid lifecycle jumps\", async () => {
"""
new_test = """  it(\"creates linear unchanged-content Draft revisions from exact historical versions\", async () => {
    const { database, service } = await createHarness();
    for (const [targetState, auditEventId, occurredAt] of [
      [\"review\", \"audit-v1-review\", \"2026-08-11T00:00:00.000Z\"],
      [\"approved\", \"audit-v1-approved\", \"2026-08-11T00:01:00.000Z\"],
      [\"published\", \"audit-v1-published\", \"2026-08-11T00:02:00.000Z\"],
    ] as const) {
      await service.transitionVersion({
        tenantId: \"tenant-1\",
        workspaceId: \"workspace-1\",
        templateVersionId: \"template-version-1\",
        targetState,
        actorSubjectId: \"manager-1\",
        auditEventId,
        occurredAt,
      });
    }

    const second = await service.createRevision({
      tenantId: \"tenant-1\",
      workspaceId: \"workspace-1\",
      sourceTemplateVersionId: \"template-version-1\",
      templateVersionId: \"template-version-2\",
      revisionNote: \"Annual unchanged-content reissue\",
      actorSubjectId: \"manager-1\",
      auditEventId: \"audit-v2-created\",
      occurredAt: \"2026-08-11T00:03:00.000Z\",
    });
    expect(second.versionNumber).toBe(2);
    expect(second.lifecycleState).toBe(\"draft\");
    expect(second.contentHash).toBe(hash);
    expect(second.contentProvider).toBe(\"r2\");
    expect(second.contentKey).toBe(
      \"tenant-1/workspace-1/template/template-1/version/1/object\",
    );
    expect(second.createdBySubjectId).toBe(\"manager-1\");
    expect(second.provenance).toContain(\"template version 1\");
    expect(second.provenance).toContain(\"content identity unchanged\");
    expect(second.provenance).toContain(\"Annual unchanged-content reissue\");
    expect(second.isCurrent).toBe(true);
    expect(
      database
        .prepare(\"SELECT current_version FROM templates WHERE id = 'template-1'\")
        .get(),
    ).toEqual({ current_version: 2 });

    const event = database
      .prepare(
        \"SELECT event_type, payload_json FROM audit_events WHERE id = 'audit-v2-created'\",
      )
      .get() as { event_type: string; payload_json: string };
    expect(event.event_type).toBe(\"template.version.created\");
    expect(JSON.parse(event.payload_json)).toMatchObject({
      sourceTemplateVersionId: \"template-version-1\",
      sourceVersionNumber: 1,
      versionNumber: 2,
      contentHash: hash,
      contentIdentityReused: true,
      revisionNote: \"Annual unchanged-content reissue\",
    });

    await expect(
      service.createRevision({
        tenantId: \"tenant-1\",
        workspaceId: \"workspace-1\",
        sourceTemplateVersionId: \"template-version-1\",
        templateVersionId: \"template-version-blocked\",
        revisionNote: \"Should be blocked\",
        actorSubjectId: \"manager-1\",
        auditEventId: \"audit-blocked\",
        occurredAt: \"2026-08-11T00:04:00.000Z\",
      }),
    ).rejects.toThrow(\"Complete or retire the current Draft/Review template revision\");

    await service.transitionVersion({
      tenantId: \"tenant-1\",
      workspaceId: \"workspace-1\",
      templateVersionId: \"template-version-2\",
      targetState: \"retired\",
      actorSubjectId: \"manager-1\",
      auditEventId: \"audit-v2-retired\",
      occurredAt: \"2026-08-11T00:05:00.000Z\",
    });
    const third = await service.createRevision({
      tenantId: \"tenant-1\",
      workspaceId: \"workspace-1\",
      sourceTemplateVersionId: \"template-version-1\",
      templateVersionId: \"template-version-3\",
      revisionNote: \"Restarted from published historical v1\",
      actorSubjectId: \"manager-1\",
      auditEventId: \"audit-v3-created\",
      occurredAt: \"2026-08-11T00:06:00.000Z\",
    });
    expect(third.versionNumber).toBe(3);
    expect(third.contentHash).toBe(hash);

    expect(() =>
      database
        .prepare(
          `INSERT INTO template_versions
             (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
              content_provider, content_key, created_by_subject_id, provenance, created_at)
           VALUES ('template-version-5', 'tenant-1', 'template-1', 5, 'retired', ?,
                   'r2', 'invalid-gap', 'manager-1', 'raw gap', ?)`,
        )
        .run(hash, timestamp),
    ).toThrow(/created in sequence/u);
    expect(() =>
      database
        .prepare(\"UPDATE templates SET current_version = 1 WHERE id = 'template-1'\")
        .run(),
    ).toThrow(/current revision must reference the latest version/u);
  });

"""
replace_once(path, insert_marker, new_test + insert_marker)

# Browser coverage: revision creation, confirmation, audit, cross-origin, responsive/accessibility.
path = "tests/e2e/template-lifecycle-admin.spec.ts"
append_marker = """test(\"retired current template version cannot create a new document\", async ({
"""
new_browser_test = """test(\"Template Manager creates a linear Draft revision from exact historical content identity\", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const sourceCard = page
    .locator(\".version-card\")
    .filter({ hasText: seededTemplateName })
    .filter({ hasText: \"Published\" });
  const sourceHash =
    (await sourceCard.locator(\"dd code\").nth(1).textContent()) ?? \"\";
  const sourceReference =
    (await sourceCard.locator(\"dd code\").nth(2).textContent()) ?? \"\";

  const revisionForm = sourceCard.locator(\".revision-form\");
  await revisionForm
    .locator('textarea[name=\"revisionNote\"]')
    .fill(\"Annual unchanged-content recertification\");
  await revisionForm
    .locator('input[name=\"confirmUnchangedContent\"]')
    .check();
  await revisionForm
    .getByRole(\"button\", { name: \"Create draft revision\" })
    .click();

  await expect(page).toHaveURL(
    /\\/demo\\/app\\/admin\\/templates\\?notice=revision-created$/u,
  );
  await expect(page.getByRole(\"status\")).toHaveText(
    \"Template Draft revision created from exact historical content identity.\",
  );
  const draftCard = page
    .locator(\".version-card\")
    .filter({ hasText: seededTemplateName })
    .filter({ hasText: \"v2 · current revision\" })
    .filter({ hasText: \"Draft\" });
  await expect(draftCard).toHaveCount(1);
  await expect(draftCard).toContainText(sourceHash);
  await expect(draftCard).toContainText(sourceReference);
  await expect(draftCard).toContainText(\"content identity unchanged\");
  await expect(draftCard).toContainText(
    \"Annual unchanged-content recertification\",
  );
  await expect(page.getByRole(\"button\", { name: \"Create draft revision\" })).toHaveCount(0);
  await expect(draftCard).toContainText(\"Revision in progress\");

  await page.goto(\"/demo/app/audit?q=template.version.created\");
  await expect(
    page.getByText(\"Template · Version · Created\", { exact: true }),
  ).toBeVisible();

  await page.goto(\"/demo/app/admin/templates\");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test(\"template revision creation requires explicit unchanged-content confirmation and same origin\", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const sourceVersionId =
    (await page
      .locator('.revision-form input[name=\"sourceTemplateVersionId\"]')
      .first()
      .getAttribute(\"value\")) ?? \"\";

  const unconfirmed = await page.request.post(
    \"/demo/app/admin/templates/revisions\",
    {
      headers: { Origin: \"http://127.0.0.1:8787\" },
      form: {
        sourceTemplateVersionId: sourceVersionId,
        revisionNote: \"Annual unchanged-content recertification\",
      },
    },
  );
  expect(unconfirmed.status()).toBe(400);
  expect(await unconfirmed.text()).toContain(
    \"Confirm that this draft revision reuses the exact existing content identity.\",
  );

  const crossOrigin = await page.request.post(
    \"/demo/app/admin/templates/revisions\",
    {
      headers: { Origin: \"https://example.test\" },
      form: {
        sourceTemplateVersionId: sourceVersionId,
        revisionNote: \"Annual unchanged-content recertification\",
        confirmUnchangedContent: \"confirmed\",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

"""
replace_once(path, append_marker, new_browser_test + append_marker)

# Durable documentation.
path = "README.md"
replace_once(
    path,
    "- controlled Template Lifecycle administration; and\n",
    "- controlled Template Lifecycle administration with exact-version unchanged-content Draft revision cloning; and\n",
)
replace_once(
    path,
    """- Templates are controlled/versioned records with lifecycle and provenance metadata.
""",
    """- Templates are controlled/versioned records with lifecycle and provenance metadata. A Template Manager may create a sequential immutable Draft revision from any exact historical version when intentionally reusing the same content identity; the source SHA-256/provider/key are copied unchanged and derivation is recorded in provenance/audit.
""",
)
replace_once(
    path,
    """Production authentication/SSO, invitation delivery, external identity provisioning/directory/group synchronization, customer uploads, production
Cloudflare D1/R2 provisioning, public interactive-demo hardening, malware scanning, retention/legal
""",
    """Production authentication/SSO, invitation delivery, external identity provisioning/directory/group synchronization, customer uploads, template binary/content replacement, production
Cloudflare D1/R2 provisioning, public interactive-demo hardening, malware scanning, retention/legal
""",
)

path = "docs/HANDOFF.md"
replace_once(
    path,
    """- controlled Template Lifecycle administration;
""",
    """- controlled Template Lifecycle administration with linear exact-version unchanged-content Draft revision creation;
""",
)
insert_after = """## Controlled document retirement

- `document.retire` is a dedicated workspace permission granted by default to Tenant Administrator,
  Workspace Administrator, and Document Owner, and available to bounded tenant custom workspace roles.
- Only an `approved` document with exact approval evidence for its current version can be retired.
- Retirement is terminal and non-destructive. It preserves document/version records, exact approvals,
  workflow/review history, template provenance, audit evidence, content references, and portable export.
- Retired documents cannot receive new versions, start or mutate workflows, receive reviews, or receive
  new approvals. Application guards and migration `0008_controlled_document_retirement.sql` independently
  enforce the historical-only boundary.
- Retirement is **not** deletion, retention enforcement, legal hold, binary cleanup, or storage disposal.
  Those production policies remain separately pending.

"""
section = insert_after + """## Template revision authoring boundary

- A Template Manager may create a new sequential immutable **Draft** revision from any exact historical
  version in the same tenant/workspace.
- This slice supports intentional unchanged-content revisions only. The new revision reuses the exact
  source SHA-256, content provider, and content key; it does not claim that binary content was edited,
  uploaded, rescanned, or replaced.
- Revision provenance records the exact source version/hash plus the manager's bounded revision note,
  and `template.version.created` is appended to the audit stream.
- A template family may have only one open Draft/Review revision at a time. Migration
  `0009_template_revision_linearity.sql` independently enforces sequential insertion, the single-open
  rule, and prevents `current_version` rollback/clearing.
- `templates.current_version` advances to the newly created Draft revision, while already-created
  documents keep their exact historical source-template provenance.
- Actual template binary/content replacement remains a separate future boundary requiring content
  identity creation plus the unresolved upload, scanning, storage, and failure-compensation decisions.

"""
replace_once(path, insert_after, section)
replace_once(
    path,
    """- template content upload/new-version authoring or new-template upload flows;
""",
    """- template binary/content replacement or upload, new-template-family upload flows, and storage/scanning orchestration;
""",
)

path = "docs/STATUS.md"
status_marker = """### Controlled document retirement (synthetic/test only)
"""
status_section = """### Linear template revision authoring (synthetic/test only)

- Template Managers can create a new sequential immutable Draft revision from any exact historical
  template version when intentionally reusing the exact same content identity.
- The new revision copies the source SHA-256, provider, and content key unchanged; bounded provenance
  and `template.version.created` audit evidence record the exact source version/hash and revision note.
- Only one Draft/Review revision may be open per template family. Migration
  `0009_template_revision_linearity.sql` independently enforces sequential versions, the single-open
  rule, and prevents `templates.current_version` rollback or clearing.
- The synthetic administration flow requires explicit confirmation that no binary/content change is
  being represented, remains same-origin/session protected, and does not accept file bytes.
- Unit/browser coverage verifies exact historical cloning, unchanged content identity, audit evidence,
  current-revision advancement, open-revision blocking, raw-SQL sequence/rollback guards, input
  validation, cross-origin denial, accessibility, responsive behavior, and synthetic-session isolation.
- This slice does **not** implement template binary editing/replacement, file upload, malware scanning,
  storage orchestration, production identity/Cloudflare resources, customer data, or paid services.

"""
replace_once(path, status_marker, status_section + status_marker)
replace_once(
    path,
    """- Template content upload/new-version authoring, new-template creation, or storage/scanning
  orchestration.
""",
    """- Template binary/content replacement or upload, new-template-family upload creation, or storage/scanning
  orchestration.
""",
)
