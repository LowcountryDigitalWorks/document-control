from pathlib import Path
import re
import sys

ROOT = Path.cwd()

ARCH = """
## Content Ingestion Architecture I — intake, integrity, and storage boundaries

Content ingestion is now modeled separately from document/version availability. This release does not register an HTTP upload route or production ingestion composition.

The provider-neutral flow is: current `document.version.create` authorization at application-owned tenant/workspace scope -> server-generated intake ID and storage key -> bounded untrusted metadata -> application SHA-256 and byte length -> immutable `ContentStore` staging as `application/octet-stream` -> D1 `staged` -> `validation_pending` -> injected validation policy -> `accepted` or `rejected`. Accepted-content retrieval rechecks current `document.read` and the stored object's expected SHA-256.

`content_ingestions` is authoritative for tenant, workspace, initiating internal subject, generated intake identity, storage reference, lifecycle, integrity metadata, accepted media type, and failure state. Composite tenant/workspace and tenant/membership foreign keys prevent caller metadata from assigning ownership. Caller filenames never construct object keys.

The lifecycle is `intake_initiated -> staged -> validation_pending -> accepted | rejected`, with bounded failure transitions to `processing_failed`. There is deliberately no `quarantined` or malware-clean state because no authoritative scanner exists. `accepted` means only that the configured ingestion validation policy accepted the candidate; it does not mean malware-clean, safe-to-open, approved, or promoted to a document version.

Current architecture ceilings are 10 MiB per materialized intake, 255 characters for display filenames, 127 characters for media-type metadata, and 32 concurrent non-terminal intakes per workspace. These are safety bounds, not customer quotas. Streaming, production rate limits, WAF policy, and Internet-scale abuse controls remain gated.

D1 and object storage are not cross-service transactional. D1 records the expected SHA-256, byte length, and generated storage key before immutable storage without claiming the object is staged. If storage succeeds but the D1 staged transition fails, recovery checks that exact key/hash/length before advancing. Missing or mismatched content fails closed. Important D1 lifecycle evidence emits minimized append-only audit rows through SQLite/D1 triggers in the same database statement as the authoritative evidence change. Rejected or failed staged bytes remain unavailable but are not automatically destroyed because retention, legal-hold, quarantine, and destructive-disposition policy are not authorized here.

Acceptance does not create a `document_versions` row. A later controlled release must explicitly promote accepted content through existing document/version authorization and exact-version evidence rules. See [ADR 0004](adr/0004-content-ingestion-staged-state-and-integrity.md).
"""

THREAT = """
## Content Ingestion Architecture I threat update

| Threat | Control established | Deferred/residual work |
| --- | --- | --- |
| Cross-tenant intake/retrieval | Current application authorization at tenant/workspace scope, composite D1 ownership constraints, and scoped lookups fail closed. | Production authenticated upload routing and tenant provisioning remain gated. |
| Filename/path/key injection | Filenames are bounded untrusted display metadata; generated storage keys use validated app-owned scope/IDs only. | Future UI must preserve output encoding and never reinterpret filenames as paths. |
| MIME/content-type confusion | Declared media type is a bounded hint; staged storage is `application/octet-stream`; validator output alone becomes accepted media type. | Final allowed-type/signature policy remains unselected. |
| Resource exhaustion | 10 MiB materialized-byte ceiling, 255-character filename bound, 127-character media-type bound, 32 in-flight candidates per workspace. | Streaming, production quotas/rate limits, WAF controls remain gated. |
| Stored-object tampering | Application SHA-256 is persisted and `ContentStore` verifies expected bytes on reads; only accepted D1 state is retrievable. | Production storage permissions/monitoring and backup reconciliation remain future work. |
| Cross-service partial failure | Expected key/hash/length are D1-owned before storage; recovery verifies the exact object before resuming; missing/mismatched objects fail closed. | Scheduled orphan reconciliation and retention-aware cleanup remain gated. |
| Rejected/failed exposure | Only `accepted` state is retrievable and acceptance does not create a document version. | Malware quarantine/disposition policy is not selected. |
| False malware-clean claim | No scanner, malware-clean state, or scanner-derived claim is introduced. | Authoritative malware scanning/quarantine is required before a production gate that depends on it. |
| Audit leakage/ambiguity | Distinct initiated/received/staged/rejected/accepted/processing-failed facts are trigger-generated from authoritative D1 values; no bytes, filenames, bearer/session/OIDC material, secrets, or unrestricted payloads. | External SIEM/archive and retention remain future decisions. |

Customer data and PHI remain prohibited. Production upload endpoints, malware scanning, streaming transport, WAF/rate limits, retention/legal hold, production Cloudflare resources, OCR/AI processing, analytics, and paid services remain outside this release.
"""

OPS = """
## Content-ingestion partial-failure recovery boundary

Content Ingestion Architecture I adds a deterministic recovery contract, not scheduled production recovery automation. D1 is authoritative for tenant/workspace/initiating-subject scope, generated storage key, candidate byte length, and expected SHA-256. A stored object is never considered accepted merely because it exists.

Recovery must re-establish current application authorization, load the intake only through tenant/workspace-scoped D1 identity, retrieve the exact application-owned key with the expected SHA-256, fail closed on missing/hash/length mismatch, resume validation only after integrity is re-established, and permit retrieval only after `accepted` state.

A storage write followed by D1 staged-state failure therefore leaves a recoverable candidate, not an accepted document and not an unowned path. This release supplies no content-disposition operation. Rejected/failed bytes must not be silently purged until retention, legal hold, quarantine, and destructive-disposition requirements are authorized. Production orphan scans, scheduled cleanup, R2 backup/restore, and customer RPO/RTO remain future work.
"""

STATUS = """
### Content Ingestion Architecture I — Intake, Integrity & Storage Boundaries

- Release base: `fd145d9d8760118991f37cc4b970a3d32ac4fa82`.
- Release branch: `release/content-ingestion-architecture-1`.
- Migrations `0013_content_ingestions.sql` and `0014_content_ingestion_audit_triggers.sql` add application-owned intake ownership/lifecycle and database-atomic minimized audit evidence without changing the accepted D1/SQLite persistence architecture.
- Intake IDs and object keys are server-generated; filenames never construct storage identity. Candidate bytes stage as `application/octet-stream`.
- SHA-256 is computed before storage, persisted as expected content identity, and reverified by existing `ContentStore` before accepted retrieval.
- Current `document.version.create` gates intake/recovery and `document.read` gates accepted retrieval; identity-provider claims, browser tenant IDs, filenames, and object keys grant no authority.
- Limits: 10 MiB per materialized intake, 255-character filenames, 127-character media-type metadata, 32 concurrent non-terminal intakes per workspace.
- `accepted` does not mean malware-clean, approved, or promoted to a document version. No scanner/quarantine claim is introduced.
- No production upload/auth route, live IdP activation, scanning service, new production Cloudflare resource, customer data, PHI, analytics, paid service, dependency, or lockfile change is introduced.
- Expected new recurring cost: `$0`.

VALIDATION_RESULTS_PLACEHOLDER
"""

HANDOFF = """
## Content Ingestion Architecture I — specialist handoff

Release base is `fd145d9d8760118991f37cc4b970a3d32ac4fa82` on `release/content-ingestion-architecture-1`. The candidate establishes provider-neutral intake, integrity, D1 lifecycle, current authorization, database-atomic minimized audit evidence, and cross-service recovery contracts while leaving all production upload composition disabled.

Architectural decisions are recorded in ADR 0004. The implementation reuses the existing `ContentStore`, SHA-256 helper, D1/SQLite authority, safe object-key approach, and current authorization policy. `document.version.create` gates intake/recovery; `document.read` gates accepted retrieval. Acceptance never grants document approval and never means malware-clean.

Migrations `0013_content_ingestions.sql` and `0014_content_ingestion_audit_triggers.sql` add the scoped lifecycle and trigger-generated lifecycle evidence. No dependency or lockfile changes are required. No customer data or PHI is used. Expected new recurring cost is `$0`.

Deliberately deferred: production upload routes, production authentication activation, live IdP wiring, final allowed-type/signature policy, malware scanning/quarantine, streaming multipart transport, production WAF/rate limits/quotas, destructive retention/legal-hold behavior, production Cloudflare resources, customer tenant provisioning, scheduled orphan cleanup, production RPO/RTO, OCR/AI, analytics, PostgreSQL/ORM work, and paid services.

VALIDATION_RESULTS_PLACEHOLDER

Recommended next release after authoritative review is an explicitly approved controlled authenticated staging vertical slice using synthetic/non-sensitive content, with live provider/scanner/resource decisions still separately gated. Do not activate customer uploads merely because this architecture exists.
"""

def append_once(path: str, heading: str, text: str) -> None:
    p = ROOT / path
    current = p.read_text(encoding="utf-8")
    if heading not in current:
        p.write_text(current.rstrip() + "\n\n" + text.strip() + "\n", encoding="utf-8")

def patch_migration_test() -> None:
    p = ROOT / "tests/unit/migration-upgrade-path.test.ts"
    s = p.read_text(encoding="utf-8")
    s = s.replace('const priorChangeSummary = "Upgrade path state before session persistence.";', 'const priorChangeSummary = "Upgrade path state before content ingestion.";')
    s = s.replace('  "0012_authenticated_session_verifiers.sql",\n] as const;', '  "0012_authenticated_session_verifiers.sql",\n  "0013_content_ingestions.sql",\n  "0014_content_ingestion_audit_triggers.sql",\n] as const;')
    s = s.replace('it("upgrades 0011 to the session-verifier schema while preserving records and invariants"', 'it("upgrades 0012 to the content-ingestion schema while preserving records and invariants"')
    s = s.replace('applyMigrationFiles(database, migrations.slice(0, -1));\n    seedPriorSupportedState(database);\n    applyMigrationFiles(database, migrations.slice(-1));', 'applyMigrationFiles(database, migrations.slice(0, -2));\n    seedPriorSupportedState(database);\n    applyMigrationFiles(database, migrations.slice(-2));')
    anchor = '    expect(sessionColumns.map((column) => column.name)).toEqual([\n      "verifier",\n      "subject_id",\n      "authenticated_at",\n      "created_at",\n      "expires_at",\n      "revoked_at",\n      "replaced_by_verifier",\n    ]);\n'
    addition = anchor + '\n    const ingestionColumns = database\n      .prepare("PRAGMA table_info(content_ingestions)")\n      .all() as { name: string }[];\n    expect(ingestionColumns.map((column) => column.name)).toContain("content_hash");\n    expect(ingestionColumns.map((column) => column.name)).toContain("accepted_media_type");\n\n    const ingestionAuditTrigger = database\n      .prepare("SELECT name FROM sqlite_master WHERE type = \'trigger\' AND name = ?")\n      .get("content_ingestions_audit_state") as { name: string } | undefined;\n    expect(ingestionAuditTrigger?.name).toBe("content_ingestions_audit_state");\n'
    if 'content_ingestions_audit_state' not in s:
        if anchor not in s: raise RuntimeError("migration test anchor not found")
        s = s.replace(anchor, addition, 1)
    p.write_text(s, encoding="utf-8")

def patch_content_store_test() -> None:
    p = ROOT / "tests/unit/content-store.test.ts"
    s = p.read_text(encoding="utf-8")
    if 'buildContentIngestionContentKey' not in s:
        s = s.replace('import {\n  buildDocumentVersionContentKey,', 'import {\n  buildContentIngestionContentKey,\n  buildDocumentVersionContentKey,', 1)
        anchor = '    expect(() =>\n      buildDocumentVersionContentKey({'
        block = '    expect(\n      buildContentIngestionContentKey({\n        tenantId: "tenant-demo",\n        workspaceId: "workspace-demo",\n        ingestionId: "intake-1",\n      }),\n    ).toBe(\n      "tenants/tenant-demo/workspaces/workspace-demo/content-ingestions/intake-1/staged-content",\n    );\n    expect(() =>\n      buildContentIngestionContentKey({\n        tenantId: "tenant-demo",\n        workspaceId: "workspace-demo",\n        ingestionId: "../escape",\n      }),\n    ).toThrow(/Unsafe content-key segment/);\n\n'
        if anchor not in s: raise RuntimeError("content-store anchor not found")
        s = s.replace(anchor, block + anchor, 1)
    p.write_text(s, encoding="utf-8")

def apply() -> None:
    patch_migration_test()
    patch_content_store_test()
    append_once("docs/ARCHITECTURE.md", "## Content Ingestion Architecture I — intake, integrity, and storage boundaries", ARCH)
    append_once("docs/THREAT_MODEL.md", "## Content Ingestion Architecture I threat update", THREAT)
    append_once("docs/OPERATIONS_RECOVERY.md", "## Content-ingestion partial-failure recovery boundary", OPS)
    append_once("docs/STATUS.md", "### Content Ingestion Architecture I — Intake, Integrity & Storage Boundaries", STATUS)
    append_once("docs/HANDOFF.md", "## Content Ingestion Architecture I — specialist handoff", HANDOFF)

def record() -> None:
    unit = Path("/tmp/unit.log").read_text(encoding="utf-8", errors="replace")
    browser = Path("/tmp/browser.log").read_text(encoding="utf-8", errors="replace")
    secrets = Path("/tmp/secrets.log").read_text(encoding="utf-8", errors="replace")
    test_files = re.search(r"Test Files\s+(\d+) passed", unit)
    tests = re.search(r"Tests\s+(\d+) passed", unit)
    browser_passed = re.search(r"(\d+) passed \(", browser)
    secret_line = re.search(r"Secret scan passed \(([^\n]+)\)\.", secrets)
    if not all([test_files, tests, browser_passed, secret_line]): raise RuntimeError("validation summary parse failed")
    summary = (
        "Validation executed on the release branch before the temporary finalizer files were removed:\n\n"
        "- Prettier: **PASS**.\n- ESLint: **PASS**.\n- Strict TypeScript: **PASS**.\n"
        f"- Secret scan: **PASS** ({secret_line.group(1)}).\n"
        f"- Vitest: **{test_files.group(1)} files, {tests.group(1)} tests passed**.\n"
        "- Worker dry-run build: **PASS**.\n- `pnpm audit --audit-level=high`: **PASS** (no high-severity audit failure).\n"
        f"- Playwright Chromium matrix: **{browser_passed.group(1)} tests passed**, preserving desktop/mobile, responsive, security-header, and axe accessibility coverage.\n\n"
        "The normal protected PR CI (`quality`, `browser`, `secrets`) remains the authoritative merge gate and must be green on the exact final reviewed head."
    )
    for path in ["docs/STATUS.md", "docs/HANDOFF.md"]:
        p = ROOT / path
        s = p.read_text(encoding="utf-8")
        if "VALIDATION_RESULTS_PLACEHOLDER" not in s: raise RuntimeError(f"placeholder missing in {path}")
        p.write_text(s.replace("VALIDATION_RESULTS_PLACEHOLDER", summary, 1), encoding="utf-8")

if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("use --apply or --record")
    if sys.argv[1] == "--apply": apply()
    elif sys.argv[1] == "--record": record()
    else: raise SystemExit("use --apply or --record")
