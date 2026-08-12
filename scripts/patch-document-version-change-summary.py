from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1))


def append_once(path: str, marker: str, content: str) -> None:
    target = Path(path)
    text = target.read_text()
    if marker in text:
        return
    target.write_text(text.rstrip() + "\n\n" + content.strip() + "\n")


Path("migrations/0011_document_version_change_summary.sql").write_text('''-- Preserve a bounded, immutable operational explanation for each exact document version.\n-- Existing rows predate this capability and receive an explicit historical sentinel.\nALTER TABLE document_versions\n  ADD COLUMN change_summary TEXT NOT NULL\n  DEFAULT 'Historical version recorded before change-summary tracking.';\n\nCREATE TRIGGER document_versions_change_summary_insert\nBEFORE INSERT ON document_versions\nWHEN NEW.change_summary = 'Historical version recorded before change-summary tracking.'\n  OR length(trim(NEW.change_summary)) < 3\n  OR length(trim(NEW.change_summary)) > 500\nBEGIN\n  SELECT RAISE(ABORT, 'document version change summary is required and must be 3-500 characters');\nEND;\n\nCREATE TRIGGER document_versions_change_summary_immutable\nBEFORE UPDATE OF change_summary ON document_versions\nWHEN NEW.change_summary IS NOT OLD.change_summary\nBEGIN\n  SELECT RAISE(ABORT, 'document version change summary is immutable');\nEND;\n''')

Path("src/application/document-version-change-summary.ts").write_text('''export class DocumentVersionChangeSummaryValidationError extends Error {\n  public constructor(message: string) {\n    super(message);\n    this.name = "DocumentVersionChangeSummaryValidationError";\n  }\n}\n\nexport function normalizeDocumentVersionChangeSummary(value: string): string {\n  const summary = value.trim();\n  if (summary.length < 3 || summary.length > 500) {\n    throw new DocumentVersionChangeSummaryValidationError(\n      "Document version change summary must be between 3 and 500 characters.",\n    );\n  }\n  for (const character of summary) {\n    const codePoint = character.codePointAt(0);\n    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) {\n      throw new DocumentVersionChangeSummaryValidationError(\n        "Document version change summary cannot contain control characters.",\n      );\n    }\n  }\n  return summary;\n}\n''')

replace_once(
    "src/domain/models.ts",
    '''  contentProvider: string;\n  contentKey: string;\n  createdBySubjectId: Identifier;\n''',
    '''  contentProvider: string;\n  contentKey: string;\n  changeSummary?: string;\n  createdBySubjectId: Identifier;\n''',
)

replace_once(
    "src/application/document-workflow-service.ts",
    '''import { transitionWorkflow } from "../domain/workflow";\nimport { buildDocumentVersionContentKey } from "../infrastructure/content-key";\n''',
    '''import { transitionWorkflow } from "../domain/workflow";\nimport { buildDocumentVersionContentKey } from "../infrastructure/content-key";\nimport { normalizeDocumentVersionChangeSummary } from "./document-version-change-summary";\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''  contentHash: string;\n  contentKey: string;\n  actorSubjectId: string;\n  occurredAt: string;\n  auditEventId: string;\n}\n\nexport interface RetireDocumentCommand''',
    '''  contentHash: string;\n  contentKey: string;\n  changeSummary: string;\n  actorSubjectId: string;\n  occurredAt: string;\n  auditEventId: string;\n}\n\nexport interface RetireDocumentCommand''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''  contentProvider: string;\n  contentKey: string;\n  createdBySubjectId: string;\n  createdAt: string;\n}\n\ninterface TemplateSourceRow''',
    '''  contentProvider: string;\n  contentKey: string;\n  changeSummary: string | null;\n  createdBySubjectId: string;\n  createdAt: string;\n}\n\ninterface TemplateSourceRow''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''      contentProvider: "r2",\n      contentKey: command.contentKey,\n      createdBySubjectId: command.actorSubjectId,\n''',
    '''      contentProvider: "r2",\n      contentKey: command.contentKey,\n      changeSummary: "Initial version created from approved template.",\n      createdBySubjectId: command.actorSubjectId,\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''          contentHash: command.contentHash,\n          templateId: command.templateId,\n''',
    '''          contentHash: command.contentHash,\n          changeSummary: version.changeSummary,\n          templateId: command.templateId,\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''    const nextVersionNumber = rows[0]?.nextVersionNumber ?? 1;\n    const version: DocumentVersion = {\n''',
    '''    const nextVersionNumber = rows[0]?.nextVersionNumber ?? 1;\n    const changeSummary = normalizeDocumentVersionChangeSummary(\n      command.changeSummary,\n    );\n    const version: DocumentVersion = {\n''',
)
# This is the second version object occurrence, after the initial-version replacement above.
service_path = Path("src/application/document-workflow-service.ts")
service_text = service_path.read_text()
needle = '''      contentProvider: "r2",\n      contentKey: command.contentKey,\n      createdBySubjectId: command.actorSubjectId,\n'''
if service_text.count(needle) != 1:
    raise SystemExit(f"Expected one changed-version object match, found {service_text.count(needle)}")
service_path.write_text(service_text.replace(needle, '''      contentProvider: "r2",\n      contentKey: command.contentKey,\n      changeSummary,\n      createdBySubjectId: command.actorSubjectId,\n''', 1))
replace_once(
    "src/application/document-workflow-service.ts",
    '''          contentHash: command.contentHash,\n          previousVersionId: document.currentVersionId,\n''',
    '''          contentHash: command.contentHash,\n          changeSummary,\n          previousVersionId: document.currentVersionId,\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''  content_provider AS contentProvider,\n  content_key AS contentKey,\n  created_by_subject_id AS createdBySubjectId,\n''',
    '''  content_provider AS contentProvider,\n  content_key AS contentKey,\n  change_summary AS changeSummary,\n  created_by_subject_id AS createdBySubjectId,\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''       (id, tenant_id, document_id, version_number, content_hash, content_provider,\n        content_key, created_by_subject_id, created_at)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)``,'''.replace("``,", "`,"),
    '''       (id, tenant_id, document_id, version_number, content_hash, content_provider,\n        content_key, change_summary, created_by_subject_id, created_at)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)``,'''.replace("``,", "`,"),
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''      version.contentProvider,\n      version.contentKey,\n      version.createdBySubjectId,\n''',
    '''      version.contentProvider,\n      version.contentKey,\n      version.changeSummary,\n      version.createdBySubjectId,\n''',
)
replace_once(
    "src/application/document-workflow-service.ts",
    '''    contentProvider: row.contentProvider,\n    contentKey: row.contentKey,\n    createdBySubjectId: row.createdBySubjectId,\n''',
    '''    contentProvider: row.contentProvider,\n    contentKey: row.contentKey,\n    changeSummary: row.changeSummary ?? undefined,\n    createdBySubjectId: row.createdBySubjectId,\n''',
)

# Every service caller creating a changed synthetic/test version must provide a bounded reason.
for path in list(Path("src").rglob("*.ts")) + list(Path("tests").rglob("*.ts")):
    text = path.read_text()
    search_from = 0
    changed = False
    while True:
        start = text.find(".createChangedVersion({", search_from)
        if start < 0:
            break
        actor = text.find("actorSubjectId:", start)
        if actor < 0:
            raise SystemExit(f"Could not find actorSubjectId after createChangedVersion in {path}")
        segment = text[start:actor]
        if "changeSummary:" not in segment:
            line_start = text.rfind("\n", 0, actor) + 1
            indent = text[line_start:actor]
            text = text[:line_start] + indent + 'changeSummary: "Synthetic controlled version change.",\n' + text[line_start:]
            changed = True
            search_from = actor + len('changeSummary: "Synthetic controlled version change.",\n')
        else:
            search_from = actor + 1
    if changed:
        path.write_text(text)

replace_once(
    "src/application/document-detail-read-service.ts",
    '''  contentHash: string;\n  contentProvider: string;\n  createdBySubjectId: string;\n''',
    '''  contentHash: string;\n  contentProvider: string;\n  changeSummary: string;\n  createdBySubjectId: string;\n''',
)
replace_once(
    "src/application/document-detail-read-service.ts",
    '''  contentHash: string;\n  contentProvider: string;\n  createdBySubjectId: string;\n  createdByName: string;\n''',
    '''  contentHash: string;\n  contentProvider: string;\n  changeSummary: string;\n  createdBySubjectId: string;\n  createdByName: string;\n''',
)
replace_once(
    "src/application/document-detail-read-service.ts",
    '''         version.content_hash AS contentHash,\n         version.content_provider AS contentProvider,\n         version.created_by_subject_id AS createdBySubjectId,\n''',
    '''         version.content_hash AS contentHash,\n         version.content_provider AS contentProvider,\n         version.change_summary AS changeSummary,\n         version.created_by_subject_id AS createdBySubjectId,\n''',
)
replace_once(
    "src/application/document-detail-read-service.ts",
    '''        contentHash: version.contentHash,\n        contentProvider: version.contentProvider,\n        createdBySubjectId: version.createdBySubjectId,\n''',
    '''        contentHash: version.contentHash,\n        contentProvider: version.contentProvider,\n        changeSummary: version.changeSummary,\n        createdBySubjectId: version.createdBySubjectId,\n''',
)

replace_once(
    "src/application/document-evidence-export.ts",
    '''      contentHash: string;\n      contentProvider: string;\n      createdByName: string;\n''',
    '''      contentHash: string;\n      contentProvider: string;\n      changeSummary: string;\n      createdByName: string;\n''',
)
replace_once(
    "src/application/document-evidence-export.ts",
    '''        contentHash: version.contentHash,\n        contentProvider: version.contentProvider,\n        createdByName: version.createdByName,\n''',
    '''        contentHash: version.contentHash,\n        contentProvider: version.contentProvider,\n        changeSummary: version.changeSummary,\n        createdByName: version.createdByName,\n''',
)

replace_once(
    "src/ui/render-document-detail.ts",
    '''        <p>Created by ${escapeHtml(version.createdByName)} · ${escapeHtml(formatTimestamp(version.createdAt))}</p>\n      </div>\n''',
    '''        <p>Created by ${escapeHtml(version.createdByName)} · ${escapeHtml(formatTimestamp(version.createdAt))}</p>\n        <p><strong>Change summary:</strong> ${escapeHtml(version.changeSummary)}</p>\n      </div>\n''',
)

replace_once(
    "src/application/portable-export-read-service.ts",
    '''              content_provider AS contentProvider,\n              content_key AS contentKey,\n              created_by_subject_id AS createdBySubjectId,\n''',
    '''              content_provider AS contentProvider,\n              content_key AS contentKey,\n              change_summary AS changeSummary,\n              created_by_subject_id AS createdBySubjectId,\n''',
)

replace_once(
    "src/application/export.ts",
    '''} from "../domain/models";\n\nexport const exportFormat''',
    '''} from "../domain/models";\nimport { normalizeDocumentVersionChangeSummary } from "./document-version-change-summary";\n\nexport const exportFormat''',
)
replace_once(
    "src/application/export.ts",
    '''    assertReferenced(subjects, version.createdBySubjectId, "document creator");\n  }\n\n  for (const document of data.documents) {''',
    '''    assertReferenced(subjects, version.createdBySubjectId, "document creator");\n    if (version.changeSummary !== undefined) {\n      normalizeDocumentVersionChangeSummary(version.changeSummary);\n    }\n  }\n\n  for (const document of data.documents) {''',
)

# Unit tests for the bounded value contract.
Path("tests/unit/document-version-change-summary.test.ts").write_text('''import { describe, expect, it } from "vitest";\nimport {\n  DocumentVersionChangeSummaryValidationError,\n  normalizeDocumentVersionChangeSummary,\n} from "../../src/application/document-version-change-summary";\n\ndescribe("document version change summary", () => {\n  it("trims and accepts bounded plain text", () => {\n    expect(normalizeDocumentVersionChangeSummary("  Updated opening sequence.  ")).toBe(\n      "Updated opening sequence.",\n    );\n  });\n\n  it("rejects too-short, oversized, and control-character values", () => {\n    expect(() => normalizeDocumentVersionChangeSummary("x")).toThrow(\n      DocumentVersionChangeSummaryValidationError,\n    );\n    expect(() => normalizeDocumentVersionChangeSummary("x".repeat(501))).toThrow(\n      DocumentVersionChangeSummaryValidationError,\n    );\n    expect(() => normalizeDocumentVersionChangeSummary("bad\\nsummary")).toThrow(\n      /control characters/,\n    );\n  });\n});\n''')

Path("tests/unit/document-version-change-summary-integrity.test.ts").write_text('''import { readFile } from "node:fs/promises";\nimport { DatabaseSync } from "node:sqlite";\nimport { describe, expect, it } from "vitest";\n\nconst timestamp = "2026-08-12T17:00:00.000Z";\n\ndescribe("document version change-summary migration", () => {\n  it("backfills historical rows and enforces bounded immutable summaries for new rows", async () => {\n    const database = new DatabaseSync(":memory:");\n    database.exec(\n      await readFile(new URL("../../migrations/0001_initial.sql", import.meta.url), "utf8"),\n    );\n    database.exec(`\n      INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)\n      VALUES ('subject-author', 'Avery Author', 'external', 'author', '${timestamp}');\n      INSERT INTO tenants (id, name, slug, created_at)\n      VALUES ('tenant-a', 'Tenant A', 'tenant-a', '${timestamp}');\n      INSERT INTO workspaces (id, tenant_id, name, created_at)\n      VALUES ('workspace-a', 'tenant-a', 'Operations', '${timestamp}');\n      INSERT INTO documents\n        (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at)\n      VALUES ('document-a', 'tenant-a', 'workspace-a', 'Checklist', 'draft', NULL, 'none', '${timestamp}', '${timestamp}');\n      INSERT INTO document_versions\n        (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at)\n      VALUES ('version-a-1', 'tenant-a', 'document-a', 1, 'sha256:${"1".repeat(64)}', 'r2', 'legacy-key', 'subject-author', '${timestamp}');\n    `);\n\n    const migration = await readFile(\n      new URL("../../migrations/0011_document_version_change_summary.sql", import.meta.url),\n      "utf8",\n    );\n    database.exec(migration);\n\n    const historical = database\n      .prepare("SELECT change_summary AS changeSummary FROM document_versions WHERE id = 'version-a-1'")\n      .get() as { changeSummary: string };\n    expect(historical.changeSummary).toBe(\n      "Historical version recorded before change-summary tracking.",\n    );\n\n    const insert = database.prepare(`INSERT INTO document_versions\n      (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, change_summary, created_by_subject_id, created_at)\n      VALUES (?, 'tenant-a', 'document-a', 2, ?, 'r2', ?, ?, 'subject-author', ?)`);\n    expect(() =>\n      insert.run(\n        "version-a-2",\n        `sha256:${"2".repeat(64)}`,\n        "key-2",\n        "Updated opening sequence.",\n        timestamp,\n      ),\n    ).not.toThrow();\n\n    expect(() =>\n      database.prepare(`INSERT INTO document_versions\n        (id, tenant_id, document_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, created_at)\n        VALUES ('version-a-3', 'tenant-a', 'document-a', 3, ?, 'r2', 'key-3', 'subject-author', ?)`)
        .run(`sha256:${"3".repeat(64)}`, timestamp),\n    ).toThrow(/change summary is required/);\n\n    expect(() =>\n      database.prepare("UPDATE document_versions SET change_summary = ? WHERE id = 'version-a-2'")\n        .run("Rewritten reason"),\n    ).toThrow(/change summary is immutable/);\n  });\n});\n''')

# Service tests need the additive migration because the service now writes the new column.
for path in Path("tests/unit").glob("*.test.ts"):
    text = path.read_text()
    if "DocumentWorkflowService" not in text or "0001_initial.sql" not in text:
        continue
    old = "  database.exec(migration);\n"
    if old not in text or "0011_document_version_change_summary.sql" in text:
        continue
    new = '''  database.exec(migration);\n  database.exec(\n    await readFile(\n      new URL(\n        "../../migrations/0011_document_version_change_summary.sql",\n        import.meta.url,\n      ),\n      "utf8",\n    ),\n  );\n'''
    path.write_text(text.replace(old, new, 1))

# Evidence-export fixtures get a representative summary when they construct version evidence directly.
fixture_path = Path("tests/unit/document-evidence-export.test.ts")
fixture_text = fixture_path.read_text()
fixture_text = fixture_text.replace(
    'contentProvider: "r2",\n',
    'contentProvider: "r2",\n          changeSummary: "Synthetic controlled version change.",\n',
)
fixture_path.write_text(fixture_text)

append_once(
    "README.md",
    "Document version change traceability",
    '''## Document version change traceability\n\nEvery newly created controlled document version carries a bounded immutable change summary alongside its exact SHA-256 identity. The summary is operational metadata only—it does not imply in-app binary editing or upload—and is visible in document evidence and included in portable/evidence exports. Historical versions created before this capability are explicitly marked as such.''',
)
append_once(
    "docs/HANDOFF.md",
    "Immutable document-version change-summary boundary",
    '''## Immutable document-version change-summary boundary\n\n- Migration `0011_document_version_change_summary.sql` adds a bounded change summary to exact document versions, backfills pre-feature versions with an explicit historical marker, rejects new inserts that omit a real summary, and prevents later summary rewrites.\n- Initial template-derived versions receive a server-controlled initial-version summary; changed versions must provide a trimmed 3–500 character summary with control characters rejected before persistence.\n- The summary is metadata about why an exact version exists. It does not represent rich authoring, file replacement, upload, malware scanning, or content transformation.\n- Document detail and `document-evidence/v1` show the summary next to the exact version/hash. Tenant portable export v1 includes the additive optional `changeSummary` field so older v1 packages remain valid.\n- New recurring cost is $0; no production resources are introduced.''',
)
append_once(
    "docs/STATUS.md",
    "Immutable document-version change summaries (synthetic/test only)",
    '''### Immutable document-version change summaries (synthetic/test only)\n\n- Each newly created exact document version now records a bounded operational change summary explaining why that immutable version exists. Initial template-derived versions receive a server-controlled initial summary; changed versions require a trimmed 3–500 character summary and reject control characters.\n- Migration `0011_document_version_change_summary.sql` backfills older versions with an explicit pre-tracking historical marker, rejects new inserts that omit a real bounded summary, and makes the summary immutable after insert.\n- Document evidence pages and versioned `document-evidence/v1` downloads expose the summary beside the exact version/hash. Tenant portable export v1 carries it as an additive optional field so older v1 exports remain accepted.\n- The synthetic guided version-2 action supplies a fixed synthetic change reason; this release does not add a binary editor, file upload, content replacement, malware scanning, rich authoring, retention/legal-hold behavior, production identity, production Cloudflare resources, or paid services.\n- Unit/browser/export coverage validates trimming and bounds, migration backfill, raw-SQL omission rejection, immutability, evidence visibility, export preservation, and existing lifecycle behavior.\n''',
)
append_once(
    "docs/contracts/export-v1.md",
    "Document-version change summary",
    '''### Document-version change summary\n\n`documentVersions[].changeSummary` is an additive optional v1 field. Current exports include the bounded immutable summary stored with each exact document version. Parsers continue accepting older v1 packages that predate the field; when the field is present it must satisfy the current 3–500 character plain-text validation contract.''',
)

# Focused browser assertions: the synthetic v1/v2 summaries must be visible in version evidence.
e2e = Path("tests/e2e/document-detail.spec.ts")
text = e2e.read_text()
marker = '  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();\n'
if marker in text and "Initial version created from approved template." not in text:
    text = text.replace(
        marker,
        marker + '  await expect(page.getByText("Initial version created from approved template.", { exact: true })).toBeVisible();\n',
        1,
    )
change_marker = '  await page.getByRole("button", { name: "Create changed version 2" }).click();\n'
if change_marker in text and "Synthetic controlled version change." not in text:
    text = text.replace(
        change_marker,
        change_marker + '  await expect(page.getByText("Synthetic controlled version change.", { exact: true })).toBeVisible();\n',
        1,
    )
e2e.write_text(text)
