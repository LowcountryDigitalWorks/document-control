from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# Permission vocabulary and custom-role availability.
replace_once(
    "src/application/authorization.ts",
    '  "document.version.create",\n  "document.review",',
    '  "document.version.create",\n  "document.retire",\n  "document.review",',
)
replace_once(
    "src/application/roles-access-admin-service.ts",
    '  "document.version.create",\n  "document.review",',
    '  "document.version.create",\n  "document.retire",\n  "document.review",',
)

# Document workflow service: command, terminal guards, retirement operation.
replace_once(
    "src/application/document-workflow-service.ts",
    "export interface CreateChangedVersionCommand {\n  tenantId: string;\n  documentId: string;\n  versionId: string;\n  contentHash: string;\n  contentKey: string;\n  actorSubjectId: string;\n  occurredAt: string;\n  auditEventId: string;\n}\n",
    "export interface CreateChangedVersionCommand {\n  tenantId: string;\n  documentId: string;\n  versionId: string;\n  contentHash: string;\n  contentKey: string;\n  actorSubjectId: string;\n  occurredAt: string;\n  auditEventId: string;\n}\n\nexport interface RetireDocumentCommand {\n  tenantId: string;\n  documentId: string;\n  actorSubjectId: string;\n  occurredAt: string;\n  auditEventId: string;\n}\n",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    if (!document.currentVersionId) {\n      throw new Error(\n        \"A document must have a current version before a workflow can start.\",\n      );\n    }",
    "    assertDocumentOpenForWork(document);\n    if (!document.currentVersionId) {\n      throw new Error(\n        \"A document must have a current version before a workflow can start.\",\n      );\n    }",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n    const documentStatus = statusForWorkflowState(next.state);",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n    assertDocumentOpenForWork(document);\n    const documentStatus = statusForWorkflowState(next.state);",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n\n    const review: Review = {",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n    assertDocumentOpenForWork(document);\n\n    const review: Review = {",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n    if (document.currentVersionId !== instance.documentVersionId) {",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      instance.documentId,\n    );\n    assertDocumentOpenForWork(document);\n    if (document.currentVersionId !== instance.documentVersionId) {",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      command.documentId,\n    );\n    assertExpectedContentKey({",
    "    const document = await this.loadDocument(\n      command.tenantId,\n      command.documentId,\n    );\n    assertDocumentOpenForWork(document);\n    assertExpectedContentKey({",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "    return version;\n  }\n\n  public async getEvidence(\n    tenantId: string,",
    "    return version;\n  }\n\n  public async retireDocument(command: RetireDocumentCommand): Promise<Document> {\n    const document = await this.loadDocument(command.tenantId, command.documentId);\n    if (document.status === \"retired\") {\n      return document;\n    }\n    if (document.status !== \"approved\") {\n      throw new Error(\"Only approved documents can be retired.\");\n    }\n    if (!document.currentVersionId) {\n      throw new Error(\"An approved document must have a current version before retirement.\");\n    }\n\n    const version = await this.loadDocumentVersion(\n      command.tenantId,\n      document.currentVersionId,\n    );\n    const [approval] = await this.database.query<{ id: string }>(\n      `SELECT id\n       FROM approvals\n       WHERE tenant_id = ?\n         AND document_id = ?\n         AND document_version_id = ?\n         AND content_hash = ?\n       LIMIT 1`,\n      [command.tenantId, document.id, version.id, version.contentHash],\n    );\n    if (!approval) {\n      throw new Error(\n        \"Document retirement requires exact approval evidence for the current version.\",\n      );\n    }\n\n    await this.database.executeBatch([\n      statement(\n        \"UPDATE documents SET status = 'retired', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'approved' AND current_version_id = ?\",\n        [\n          command.occurredAt,\n          document.id,\n          command.tenantId,\n          version.id,\n        ],\n      ),\n      auditStatement({\n        id: command.auditEventId,\n        tenantId: command.tenantId,\n        workspaceId: document.workspaceId,\n        actorSubjectId: command.actorSubjectId,\n        eventType: \"document.retired\",\n        entityType: \"document\",\n        entityId: document.id,\n        occurredAt: command.occurredAt,\n        payload: {\n          previousStatus: document.status,\n          currentVersionId: version.id,\n          currentVersionNumber: version.versionNumber,\n          contentHash: version.contentHash,\n          approvalId: approval.id,\n        },\n      }),\n    ]);\n\n    return { ...document, status: \"retired\" };\n  }\n\n  public async getEvidence(\n    tenantId: string,",
)
replace_once(
    "src/application/document-workflow-service.ts",
    "function assertCanonicalHash(hash: string): void {",
    "function assertDocumentOpenForWork(document: Document): void {\n  if (document.status === \"retired\") {\n    throw new Error(\n      \"Retired documents are historical and cannot be changed or receive new workflow activity.\",\n    );\n  }\n}\n\nfunction assertCanonicalHash(hash: string): void {",
)

# Authorized facade.
replace_once(
    "src/application/authorized-document-workflow-service.ts",
    "  RecordReviewCommand,\n  StartWorkflowCommand,",
    "  RecordReviewCommand,\n  RetireDocumentCommand,\n  StartWorkflowCommand,",
)
replace_once(
    "src/application/authorized-document-workflow-service.ts",
    "  public async getEvidence(input: {",
    "  public async retireDocument(command: RetireDocumentCommand): Promise<import(\"../domain/models\").Document> {\n    await this.authorization.assertAllowed({\n      subjectId: command.actorSubjectId,\n      tenantId: command.tenantId,\n      documentId: command.documentId,\n      permission: \"document.retire\",\n    });\n    return this.workflow.retireDocument(command);\n  }\n\n  public async getEvidence(input: {",
)

# HTTP imports and document detail/retirement route.
replace_once(
    "src/index.ts",
    'import { AuthorizedDocumentDetailReadService } from "./application/authorized-document-detail-read-service";\n',
    'import { AuthorizedDocumentDetailReadService } from "./application/authorized-document-detail-read-service";\nimport { AuthorizedDocumentWorkflowService } from "./application/authorized-document-workflow-service";\n',
)
replace_once(
    "src/index.ts",
    '} from "./application/document-detail-read-service";\nimport { serializeExport }',
    '} from "./application/document-detail-read-service";\nimport {\n  parseDocumentRetirementInput,\n  DocumentRetirementInputValidationError,\n} from "./application/document-retirement-input";\nimport { DocumentWorkflowService } from "./application/document-workflow-service";\nimport { serializeExport }',
)
replace_once(
    "src/index.ts",
    "    return context.html(\n      renderDocumentDetail(\n        await createPersistedTenantTheme(database, context.env, demo.tenantId),\n        detail,\n      ),\n    );",
    "    const notice =\n      new URL(context.req.url).searchParams.get(\"notice\") === \"retired\"\n        ? \"Document retired. Historical versions, approvals, workflows, provenance, and audit evidence remain preserved.\"\n        : undefined;\n    return context.html(\n      renderDocumentDetail(\n        await createPersistedTenantTheme(database, context.env, demo.tenantId),\n        detail,\n        notice,\n      ),\n    );",
)
replace_once(
    "src/index.ts",
    "});\n\napp.get(\"/demo/app/templates\", async (context) => {",
    "});\n\napp.post(\"/demo/app/documents/:documentId/retire\", async (context) => {\n  if (!guidedDemoEnabled(context.env)) return context.notFound();\n  if (!hasSameOrigin(context.req.url, context.req.header(\"Origin\"))) {\n    return context.json({ error: \"Same-origin demo request required.\" }, 403);\n  }\n  const sessionId = readGuidedDemoSession(context.req.header(\"Cookie\"));\n  if (!sessionId) {\n    return context.json(\n      { error: \"Synthetic evidence session missing. Reload the document.\" },\n      409,\n    );\n  }\n\n  try {\n    parseDocumentRetirementInput(\n      await readDocumentRetirementFormValues(context.req.raw),\n    );\n    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);\n    const demo = createGuidedDemoContext(sessionId);\n    await ensureGuidedDemoSeed(database, sessionId);\n    const evidenceReader = await ensureGuidedEvidenceReader(database, sessionId);\n    await createAuthorizedDocumentWorkflowService(database).retireDocument({\n      tenantId: demo.tenantId,\n      documentId: context.req.param(\"documentId\"),\n      actorSubjectId: evidenceReader.subjectId,\n      auditEventId: `document-retirement-${crypto.randomUUID()}`,\n      occurredAt: new Date().toISOString(),\n    });\n    return context.redirect(\n      `/demo/app/documents/${encodeURIComponent(context.req.param(\"documentId\"))}?notice=retired`,\n      303,\n    );\n  } catch (error) {\n    if (error instanceof DocumentRetirementInputValidationError) {\n      return context.text(error.message, 400);\n    }\n    if (error instanceof AuthorizationDeniedError) {\n      return context.html(renderNotFound(createTheme(context.env)), 404);\n    }\n    return context.text(\n      error instanceof Error ? error.message : \"Document retirement failed.\",\n      409,\n    );\n  }\n});\n\napp.get(\"/demo/app/templates\", async (context) => {",
)
replace_once(
    "src/index.ts",
    "function createAuthorizedDocumentDetailReadService(\n  database: D1DatabaseProvider,\n): AuthorizedDocumentDetailReadService {\n  return new AuthorizedDocumentDetailReadService(\n    new DocumentDetailReadService(database),\n    new DatabaseAuthorizationPolicy(database),\n  );\n}\n",
    "function createAuthorizedDocumentDetailReadService(\n  database: D1DatabaseProvider,\n): AuthorizedDocumentDetailReadService {\n  return new AuthorizedDocumentDetailReadService(\n    new DocumentDetailReadService(database),\n    new DatabaseAuthorizationPolicy(database),\n  );\n}\n\nfunction createAuthorizedDocumentWorkflowService(\n  database: D1DatabaseProvider,\n): AuthorizedDocumentWorkflowService {\n  return new AuthorizedDocumentWorkflowService(\n    new DocumentWorkflowService(database),\n    new DatabaseAuthorizationPolicy(database),\n  );\n}\n",
)
replace_once(
    "src/index.ts",
    "async function readMemberFormValues(\n  request: Request,",
    "async function readDocumentRetirementFormValues(\n  request: Request,\n): Promise<URLSearchParams> {\n  let formData: FormData;\n  try {\n    formData = await request.formData();\n  } catch {\n    throw new DocumentRetirementInputValidationError(\n      \"A valid form body is required.\",\n    );\n  }\n  const values = new URLSearchParams();\n  const confirmation = formData.get(\"confirmRetirement\");\n  if (typeof confirmation === \"string\") {\n    values.set(\"confirmRetirement\", confirmation);\n  }\n  return values;\n}\n\nasync function readMemberFormValues(\n  request: Request,",
)

# Document detail UI.
replace_once(
    "src/ui/render-document-detail.ts",
    "export function renderDocumentDetail(\n  theme: ThemeConfig,\n  detail: DocumentDetailEvidence,\n): string {",
    "export function renderDocumentDetail(\n  theme: ThemeConfig,\n  detail: DocumentDetailEvidence,\n  notice?: string,\n): string {",
)
replace_once(
    "src/ui/render-document-detail.ts",
    '<span class="demo-label">Synthetic evidence · read-only</span>',
    '<span class="demo-label">Synthetic evidence · controlled lifecycle</span>',
)
replace_once(
    "src/ui/render-document-detail.ts",
    "            <p class=\"lede\">Version, workflow, approval, template provenance, and audit evidence assembled from persisted tenant-scoped records.</p>\n          </div>\n          <span class=\"badge ${currentApprovalApplies(detail) ? \"success\" : \"warning\"}\">\n            ${currentApprovalApplies(detail) ? \"Current version approved\" : \"Current approval required\"}\n          </span>\n        </div>\n      </section>\n\n      ${renderSourceTemplate(detail)}",
    "            <p class=\"lede\">Version, workflow, approval, template provenance, and audit evidence assembled from persisted tenant-scoped records.</p>\n          </div>\n          ${renderCurrentStateBadge(detail)}\n        </div>\n        ${notice ? `<p class=\"notice\" role=\"status\">${escapeHtml(notice)}</p>` : \"\"}\n      </section>\n\n      ${renderDocumentRetirement(detail)}\n      ${renderSourceTemplate(detail)}",
)
replace_once(
    "src/ui/render-document-detail.ts",
    "function renderSourceTemplate(detail: DocumentDetailEvidence): string {",
    "function renderDocumentRetirement(detail: DocumentDetailEvidence): string {\n  if (detail.status === \"retired\") {\n    return `<section class=\"panel retirement-panel\" aria-labelledby=\"retirement-title\">\n      <p class=\"eyebrow\">Controlled disposition</p>\n      <h2 id=\"retirement-title\">Retired historical record</h2>\n      <p>This document is no longer operational. Its exact versions, approvals, workflows, source provenance, and audit evidence remain preserved and readable.</p>\n    </section>`;\n  }\n  if (detail.status !== \"approved\") {\n    return \"\";\n  }\n  return `<section class=\"panel retirement-panel\" aria-labelledby=\"retirement-title\">\n    <p class=\"eyebrow\">Controlled disposition</p>\n    <h2 id=\"retirement-title\">Retire this approved document</h2>\n    <p>Retirement is terminal and non-destructive. It stops new versions and workflow activity but preserves all historical evidence. It does not delete content or enforce a retention schedule.</p>\n    <form method=\"post\" action=\"/demo/app/documents/${encodeURIComponent(detail.id)}/retire\">\n      <label class=\"confirmation\"><input type=\"checkbox\" name=\"confirmRetirement\" value=\"yes\" required> I understand this document will become historical-only.</label>\n      <button type=\"submit\">Retire document</button>\n    </form>\n  </section>`;\n}\n\nfunction renderCurrentStateBadge(detail: DocumentDetailEvidence): string {\n  if (detail.status === \"retired\") {\n    return '<span class=\"badge neutral\">Retired · evidence preserved</span>';\n  }\n  return `<span class=\"badge ${currentApprovalApplies(detail) ? \"success\" : \"warning\"}\">\n    ${currentApprovalApplies(detail) ? \"Current version approved\" : \"Current approval required\"}\n  </span>`;\n}\n\nfunction renderSourceTemplate(detail: DocumentDetailEvidence): string {",
)
replace_once(
    "src/ui/render-document-detail.ts",
    ".badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800;white-space:nowrap}",
    ".notice{margin-top:1rem;padding:.85rem 1rem;border-left:4px solid var(--brand-secondary);background:var(--surface-muted);font-weight:750}.retirement-panel form{display:grid;gap:.9rem;margin-top:1rem}.confirmation{display:flex;align-items:flex-start;gap:.65rem;font-weight:700}.confirmation input{width:1.1rem;height:1.1rem;margin-top:.25rem;flex:0 0 auto}.retirement-panel button{width:max-content;min-height:44px;border:0;border-radius:.45rem;padding:.65rem 1rem;background:var(--brand-primary);color:#fff;font:inherit;font-weight:800;cursor:pointer}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800;white-space:nowrap}",
)

# Existing browser expectation follows the now-mutable controlled-lifecycle label.
replace_once(
    "tests/e2e/document-detail.spec.ts",
    'page.getByText("Synthetic evidence · read-only")',
    'page.getByText("Synthetic evidence · controlled lifecycle")',
)

# Documentation.
replace_once(
    "README.md",
    "- immutable Workflow Definition creation/versioning;\n",
    "- immutable Workflow Definition creation/versioning;\n- terminal, non-destructive controlled document retirement with preserved evidence;\n",
)
replace_once(
    "README.md",
    "- Workflow definitions are immutable by version; workflow instances remain bound to the exact\n  definition version they started with.\n",
    "- Workflow definitions are immutable by version; workflow instances remain bound to the exact\n  definition version they started with.\n- Approved controlled documents can be terminally retired without deleting versions, approvals,\n  workflows, provenance, audit evidence, or portable-export records; retired documents cannot accept\n  new versions or workflow activity.\n",
)
replace_once(
    "docs/HANDOFF.md",
    "- controlled Workflow Definition lifecycle administration.\n",
    "- controlled Workflow Definition lifecycle administration; and\n- controlled document retirement with terminal historical-only semantics and preserved evidence.\n",
)
replace_once(
    "docs/HANDOFF.md",
    "## Synthetic application boundary\n",
    "## Controlled document retirement\n\n- `document.retire` is a dedicated workspace permission granted by default to Tenant Administrator,\n  Workspace Administrator, and Document Owner, and available to bounded tenant custom workspace roles.\n- Only an `approved` document with exact approval evidence for its current version can be retired.\n- Retirement is terminal and non-destructive. It preserves document/version records, exact approvals,\n  workflow/review history, template provenance, audit evidence, content references, and portable export.\n- Retired documents cannot receive new versions, start or mutate workflows, receive reviews, or receive\n  new approvals. Application guards and migration `0008_controlled_document_retirement.sql` independently\n  enforce the historical-only boundary.\n- Retirement is **not** deletion, retention enforcement, legal hold, binary cleanup, or storage disposal.\n  Those production policies remain separately pending.\n\n## Synthetic application boundary\n",
)
replace_once(
    "docs/STATUS.md",
    "### Workflow authoring improvements (synthetic/test only)\n",
    "### Controlled document retirement (synthetic/test only)\n\n- Approved documents with exact current-version approval evidence can be terminally retired through\n  the synthetic document evidence surface. Retirement changes operational state only; no document,\n  version, approval, workflow, review, provenance, audit, or content-reference evidence is deleted.\n- A dedicated `document.retire` workspace permission is granted by default to Tenant Administrator,\n  Workspace Administrator, and Document Owner and is available to bounded tenant custom workspace roles.\n- Service guards reject new versions and workflow/review/approval activity for retired documents.\n  Migration `0008_controlled_document_retirement.sql` independently blocks invalid retirement,\n  reactivation, new versions, new workflows, workflow mutation, reviews, and approvals at the database boundary.\n- Successful retirement appends `document.retired` to the existing immutable audit stream with the exact\n  current version/hash and approval evidence used to justify disposition. Existing portable export already\n  carries document status plus all preserved evidence, so no export-version change is required.\n- The browser flow requires explicit confirmation, remains same-origin/session protected, and keeps retired\n  records readable as historical evidence. Unit and browser coverage verify approval requirements, terminal\n  state, service/database mutation guards, role grants, audit evidence, accessibility, and responsive behavior.\n- This slice does **not** delete content, implement retention/legal hold, add storage cleanup, accept uploads,\n  configure production identity or Cloudflare resources, or add paid services.\n\n### Workflow authoring improvements (synthetic/test only)\n",
)
replace_once(
    "docs/STATUS.md",
    "- Rich document authoring, retention automation, legal hold, GRC frameworks, or AI functions.\n",
    "- Rich document authoring, retention automation, legal hold, destructive document deletion, GRC frameworks, or AI functions.\n",
)
