from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one marker in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def create_new(path: str, content: str) -> None:
    file = Path(path)
    if file.exists():
        raise SystemExit(f"Refusing to overwrite existing file: {path}")
    file.write_text(content)


create_new(
    "src/application/audit-log-export.ts",
    '''import type { AuditLogItem } from "./audit-log-read-service";\n\nconst csvHeaders = [\n  "occurred_at",\n  "event_type",\n  "entity_type",\n  "entity_id",\n  "actor",\n  "evidence_summary",\n] as const;\n\nexport function serializeAuditLogCsv(items: readonly AuditLogItem[]): string {\n  const rows = items.map((item) =>\n    [\n      item.occurredAt,\n      item.eventType,\n      item.entityType,\n      item.entityId,\n      item.actorName,\n      item.payloadSummary.join(" | "),\n    ]\n      .map(encodeCsvCell)\n      .join(","),\n  );\n\n  return `\\uFEFF${[csvHeaders.map(encodeCsvCell).join(","), ...rows].join("\\r\\n")}\\r\\n`;\n}\n\nfunction encodeCsvCell(value: string): string {\n  const safeValue = neutralizeSpreadsheetFormula(value);\n  return `"${safeValue.replaceAll('"', '""')}"`;\n}\n\nfunction neutralizeSpreadsheetFormula(value: string): string {\n  return /^[=+\\-@\\t\\r]/u.test(value) ? `'${value}` : value;\n}\n''',
)

create_new(
    "tests/unit/audit-log-export.test.ts",
    '''import { describe, expect, it } from "vitest";\nimport { serializeAuditLogCsv } from "../../src/application/audit-log-export";\nimport type { AuditLogItem } from "../../src/application/audit-log-read-service";\n\nfunction event(overrides: Partial<AuditLogItem> = {}): AuditLogItem {\n  return {\n    id: "audit-1",\n    eventType: "workflow.started",\n    entityType: "workflow",\n    entityId: "workflow-1",\n    actorSubjectId: "subject-1",\n    actorName: "Avery Auditor",\n    occurredAt: "2026-08-12T15:00:00.000Z",\n    payloadSummary: ["Version: 1", "Approved: false"],\n    ...overrides,\n  };\n}\n\ndescribe("serializeAuditLogCsv", () => {\n  it("serializes the bounded audit summary columns in input order", () => {\n    const csv = serializeAuditLogCsv([\n      event(),\n      event({\n        id: "audit-2",\n        eventType: "document.version.approved",\n        entityType: "document_version",\n        entityId: "version-2",\n        actorName: 'Alex "Approver", Jr.',\n        occurredAt: "2026-08-12T15:01:00.000Z",\n        payloadSummary: ["Version: 2"],\n      }),\n    ]);\n\n    expect(csv.startsWith("\\uFEFF")).toBe(true);\n    const rows = csv.slice(1).trimEnd().split("\\r\\n");\n    expect(rows).toHaveLength(3);\n    expect(rows[0]).toBe(\n      '"occurred_at","event_type","entity_type","entity_id","actor","evidence_summary"',\n    );\n    expect(rows[1]).toContain('"workflow.started"');\n    expect(rows[2]).toContain('"document.version.approved"');\n    expect(rows[2]).toContain('"Alex ""Approver"", Jr."');\n  });\n\n  it("neutralizes spreadsheet formula prefixes without changing ordinary text", () => {\n    const csv = serializeAuditLogCsv([\n      event({ actorName: "=HYPERLINK(\\\"https://example.invalid\\\")", entityId: "+SUM(1,1)" }),\n    ]);\n\n    expect(csv).toContain("'=HYPERLINK");\n    expect(csv).toContain("'+SUM(1,1)");\n    expect(csv).toContain('"workflow.started"');\n  });\n\n  it("exports only the already-summarized evidence supplied by the read model", () => {\n    const csv = serializeAuditLogCsv([\n      event({ payloadSummary: ["Decision: accepted", "Version: 1"] }),\n    ]);\n\n    expect(csv).toContain("Decision: accepted | Version: 1");\n    expect(csv).not.toContain("payload_json");\n    expect(csv).not.toContain("actor_subject_id");\n  });\n});\n''',
)

replace_once(
    "src/index.ts",
    'import { AuditLogReadService } from "./application/audit-log-read-service";\n',
    'import { serializeAuditLogCsv } from "./application/audit-log-export";\nimport { AuditLogReadService } from "./application/audit-log-read-service";\n',
)

route_marker = '''  return context.html(\n    renderAuditLog(\n      await createPersistedTenantTheme(database, context.env, demo.tenantId),\n      demo.workspaceName,\n      items,\n      filters,\n    ),\n  );\n});\n\napp.get("/demo/app/admin/settings", async (context) => {'''
route_replacement = '''  return context.html(\n    renderAuditLog(\n      await createPersistedTenantTheme(database, context.env, demo.tenantId),\n      demo.workspaceName,\n      items,\n      filters,\n    ),\n  );\n});\n\napp.get("/demo/app/audit/export.csv", async (context) => {\n  if (!guidedDemoEnabled(context.env)) {\n    return context.html(renderNotFound(createTheme(context.env)), 404);\n  }\n\n  let filters;\n  try {\n    filters = parseAuditLogFilters(new URL(context.req.url).searchParams);\n  } catch (error) {\n    if (error instanceof AuditLogFilterValidationError) {\n      return context.text(error.message, 400);\n    }\n    throw error;\n  }\n\n  const session = resolveGuidedDemoSession(\n    context.req.header("Cookie"),\n    context.req.url,\n  );\n  if (session.setCookie) {\n    context.header("Set-Cookie", session.setCookie);\n  }\n  const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);\n  const demo = createGuidedDemoContext(session.sessionId);\n  await ensureGuidedDemoSeed(database, session.sessionId);\n  const auditor = await ensureGuidedAuditor(database, session.sessionId);\n  const items = await createAuthorizedAuditLogReadService(\n    database,\n  ).listAuditEvents(\n    {\n      subjectId: auditor.subjectId,\n      tenantId: demo.tenantId,\n      workspaceId: demo.workspaceId,\n    },\n    filters,\n  );\n\n  context.header("Cache-Control", "no-store");\n  context.header("Content-Type", "text/csv; charset=utf-8");\n  context.header(\n    "Content-Disposition",\n    'attachment; filename="workspace-audit-log.csv"',\n  );\n  return context.body(serializeAuditLogCsv(items));\n});\n\napp.get("/demo/app/admin/settings", async (context) => {'''
replace_once("src/index.ts", route_marker, route_replacement)

replace_once(
    "src/ui/render-audit-log.ts",
    '  const filtered = Boolean(filters.query);\n  const content =\n',
    '  const filtered = Boolean(filters.query);\n  const exportHref = `/demo/app/audit/export.csv${filters.query ? `?q=${encodeURIComponent(filters.query)}` : ""}`;\n  const content =\n',
)
replace_once(
    "src/ui/render-audit-log.ts",
    '''          <button class="button" type="submit">Search audit log</button>\n          <a href="/demo/app/audit">Clear</a>\n''',
    '''          <button class="button" type="submit">Search audit log</button>\n          <a href="/demo/app/audit">Clear</a>\n          <a class="button secondary" href="${escapeHtml(exportHref)}">Export current view (CSV)</a>\n''',
)
replace_once(
    "src/ui/render-audit-log.ts",
    '      <p class="result-summary" aria-live="polite">${items.length} ${items.length === 1 ? "event" : "events"}${filtered ? " matched" : " shown"}. The ledger view is capped at 100 records.</p>\n',
    '      <p class="result-summary" aria-live="polite">${items.length} ${items.length === 1 ? "event" : "events"}${filtered ? " matched" : " shown"}. The ledger view and CSV export use the same 100-record cap and summarized evidence.</p>\n',
)

with Path("tests/e2e/audit-log.spec.ts").open("a") as file:
    file.write(
        '''\n\ntest("exports the current bounded audit view as safe CSV", async ({ page }) => {\n  await completeChangedVersionLifecycle(page);\n  await page.goto("/demo/app/audit?q=workflow");\n\n  const exportLink = page.getByRole("link", { name: "Export current view (CSV)" });\n  await expect(exportLink).toHaveAttribute(\n    "href",\n    "/demo/app/audit/export.csv?q=workflow",\n  );\n\n  const response = await page.request.get("/demo/app/audit/export.csv?q=workflow");\n  expect(response.status()).toBe(200);\n  expect(response.headers()["content-type"]).toContain("text/csv");\n  expect(response.headers()["cache-control"]).toBe("no-store");\n  expect(response.headers()["content-disposition"]).toContain(\n    'filename="workspace-audit-log.csv"',\n  );\n\n  const csv = (await response.text()).replace(/^\\uFEFF/u, "");\n  const rows = csv.trimEnd().split("\\r\\n");\n  expect(rows).toHaveLength(3);\n  expect(rows[0]).toBe(\n    '"occurred_at","event_type","entity_type","entity_id","actor","evidence_summary"',\n  );\n  expect(csv).toContain('"workflow.started"');\n  expect(csv).toContain('"workflow.transitioned"');\n  expect(csv).not.toContain('"document.created_from_template"');\n});\n\ntest("applies the same audit filter validation to CSV export", async ({ page }) => {\n  await page.goto("/demo/app/audit");\n  const response = await page.request.get(\n    `/demo/app/audit/export.csv?q=${"x".repeat(101)}`,\n  );\n  expect(response.status()).toBe(400);\n  expect(await response.text()).toBe(\n    "Audit search text must be 100 characters or fewer.",\n  );\n});\n'''
    )

replace_once(
    "README.md",
    '- workspace overview, Documents, Templates, Reviews, Approvals, Audit Log, and bounded search/filtering;\n',
    '- workspace overview, Documents, Templates, Reviews, Approvals, Audit Log, bounded search/filtering, and bounded CSV audit evidence export;\n',
)
replace_once(
    "README.md",
    '- Audit records are append-only.\n',
    '- Audit records are append-only. The synthetic workspace Audit Log can export the same authorized, filter-matched, 100-record summarized evidence view as CSV without exposing unrestricted raw payload JSON.\n',
)

replace_once(
    "docs/HANDOFF.md",
    '- Audit Log;\n',
    '- Audit Log with bounded workspace CSV evidence export;\n',
)
replace_once(
    "docs/HANDOFF.md",
    '## Synthetic application boundary\n',
    '''## Audit evidence export boundary\n\n- The workspace Audit Log remains a read over the existing append-only `audit_events` ledger.\n- An authorized Auditor may export the same current workspace/filter view as CSV; export reuses the existing `audit.read` decision, literal bounded search, newest-first ordering, and 100-record cap.\n- CSV contains only fields already represented by the Audit Log read model plus the existing four-item primitive payload summary. It does not expose unrestricted raw `payload_json` or actor subject IDs.\n- Spreadsheet-formula prefixes are neutralized before CSV encoding, and the response is `Cache-Control: no-store`.\n- This is a local/synthetic evidence convenience, not external SIEM integration, long-term archival, production audit retention, or a complete audit data warehouse/export API.\n\n## Synthetic application boundary\n''',
)
replace_once(
    "docs/HANDOFF.md",
    '- analytics, AI services, or paid SaaS dependencies.\n',
    '- external audit/SIEM archival, unrestricted raw audit-payload export, or production audit-log retention policy;\n- analytics, AI services, or paid SaaS dependencies.\n',
)

status_section = '''### Authorized tenant presentation administration (synthetic/test only)\n'''
status_insert = '''### Workspace Audit evidence CSV export (synthetic/test only)\n\n- `/demo/app/audit/export.csv` downloads the same authorized workspace Audit Log view as CSV, including the currently submitted literal search filter and the existing 100-record newest-first cap.\n- Export reuses the server-controlled synthetic Auditor and existing workspace `audit.read` authorization path; it does not introduce a broader export permission or tenant-wide audit scope.\n- CSV includes timestamp, event type, entity type/ID, actor display name, and the same bounded primitive evidence summary shown by the read model. Unrestricted raw `payload_json` and actor subject IDs are not exported.\n- Every cell is CSV-escaped and spreadsheet-formula prefixes are neutralized before download. Responses use `Cache-Control: no-store` and a fixed safe attachment filename.\n- Unit/browser coverage verifies CSV encoding, formula neutralization, filter preservation, response headers, bounded result scope, and invalid-filter rejection while existing Audit Log authorization/session-isolation coverage remains authoritative.\n- This slice does **not** add external SIEM integration, audit forwarding, long-term archival, production retention policy, a raw audit API, production authentication, customer data, Cloudflare resources, or paid services.\n\n### Authorized tenant presentation administration (synthetic/test only)\n'''
replace_once("docs/STATUS.md", status_section, status_insert)
replace_once(
    "docs/STATUS.md",
    '- External audit/SIEM export, long-term audit archival, or production log-retention policy.\n',
    '- External audit/SIEM integration or archival, unrestricted raw audit-payload export, or production log-retention policy.\n',
)

print("Workspace audit CSV export patch applied.")
