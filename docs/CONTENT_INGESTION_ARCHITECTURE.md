# Content Ingestion Architecture I

Status: release candidate architecture for `Content Ingestion Architecture I — Intake, Integrity & Storage Boundaries`.

Release base: `fd145d9d8760118991f37cc4b970a3d32ac4fa82`.

This document is an engineering architecture/security/operations record. It does not enable customer uploads, production identity, customer data, PHI, or any production Cloudflare resource.

## Architecture boundary

Content ingestion is modeled separately from document/version availability. This release does not register a public or production upload route and does not wire a production ingestion composition into the Worker.

The provider-neutral flow is:

```text
current application authorization: document.version.create
  -> application-owned tenant/workspace scope
  -> server-generated intake ID and storage key
  -> bounded untrusted display metadata
  -> application SHA-256 and byte length
  -> immutable ContentStore staging as application/octet-stream
  -> D1/SQLite staged state
  -> validation_pending
  -> injected validation policy
  -> accepted | rejected | bounded processing_failed
```

Accepted-content retrieval independently rechecks current `document.read` authorization and the stored object's expected SHA-256. Acceptance never creates a `document_versions` row.

D1/SQLite remains authoritative for the content-ingestion record: tenant, workspace, initiating internal subject, generated intake identity, storage provider/reference, lifecycle state, expected byte length and SHA-256, accepted media type, failure state, and lifecycle timestamps. Composite relational ownership constraints prevent caller metadata from assigning cross-tenant or cross-workspace ownership.

Binary content stays behind the existing provider-neutral `ContentStore`. The current R2 adapter remains an adapter rather than an authority source. No PostgreSQL migration, ORM rewrite, new database, or new object-storage service is introduced.

## Storage and object-key design

The application generates the intake identifier and storage key. The original filename is bounded display metadata only and is never used as an authoritative path, object key, tenant identifier, workspace identifier, or authorization input.

The content-ingestion key shape is:

```text
tenants/{tenantId}/workspaces/{workspaceId}/content-ingestions/{ingestionId}/staged-content
```

Every key segment is application-owned and validated by the centralized content-key builder. Path separators, traversal segments, and other unsafe key segments are rejected. Tests cover the exact generated path and traversal rejection.

Staged bytes are stored as `application/octet-stream`. A caller-declared media type is only bounded untrusted metadata. Only the configured validation policy may establish an accepted media type.

## Integrity and hash semantics

The application computes SHA-256 before storage. The authoritative form is `sha256:` followed by 64 lowercase hexadecimal characters. D1 records the expected SHA-256 and byte length before an immutable storage create is attempted.

`ContentStore.create()` verifies that bytes match the supplied SHA-256 before writing. The existing R2 adapter uses immutable create semantics and records the hash only as object metadata; object metadata is not the source of truth.

`ContentStore.get()` recomputes SHA-256 from retrieved bytes and compares it to the D1-owned expected hash. Accepted content is unavailable if the object is missing, the hash does not match, or the byte length does not match.

## Lifecycle semantics

The application-owned lifecycle is:

```text
intake_initiated
  -> received integrity metadata (state remains intake_initiated)
  -> staged
  -> validation_pending
  -> accepted | rejected
```

Bounded operational failures may transition a non-terminal intake to `processing_failed` after the failure is authoritative rather than merely suspected.

`accepted` means only that the configured ingestion validation policy accepted the candidate. It does **not** mean malware-clean, safe-to-open, approved, reviewed, OCR-processed, AI-processed, promoted to a document version, or suitable for customer production use.

There is deliberately no `malware_clean`, `quarantined`, or scanner-derived state in this release because no authoritative malware scanner or quarantine service is configured.

## Resource and metadata bounds

Current architecture ceilings are:

- 10 MiB per materialized intake;
- 255 characters for the display filename;
- 127 characters for declared/accepted media-type metadata; and
- 32 concurrent non-terminal intakes per workspace.

These are defensive architecture bounds, not customer quotas. Streaming multipart transport, production rate limits, WAF policy, Internet-scale abuse controls, and customer-specific quotas remain separate production decisions.

## Authorization and tenant isolation

This release preserves the existing authorization chain:

```text
validated external principal
  -> application-owned identity subject
  -> active tenant membership
  -> internal role binding
  -> required permission
  -> tenant/workspace/resource scope
```

`AuthorizedContentIngestionService` requires current `document.version.create` for initiate, receive/validate, and recovery operations. It requires current `document.read` again before accepted-content retrieval.

Browser selectors, identity-provider claims, display filenames, declared media types, object keys, and object-store metadata never grant authority. Repository lookups are tenant/workspace scoped, and D1 composite constraints reject cross-tenant workspace ownership. Tests suspend live membership before byte staging and prove the operation fails closed before content integrity fields are persisted.

## Cross-service failure atomicity and recovery

D1 and object storage cannot participate in one application-atomic cross-service transaction. This release therefore establishes deterministic reconciliation instead of claiming transactional atomicity across services.

D1 owns the generated storage key, expected SHA-256, and byte length before immutable object creation. A provider-neutral `ContentStore.create()` error is treated as an **indeterminate write result** because the object may have committed before the error reached the application.

The intake remains recoverable until reconciliation checks the exact D1-owned key, SHA-256, and byte length:

- if the exact immutable object exists, processing resumes without another create;
- if the object is authoritatively missing, the intake fails closed as `stored_content_missing`;
- if the stored object fails hash or length verification, processing fails closed with an integrity failure; and
- if object storage succeeds but D1 cannot record `staged`, the same exact-key/hash/length recovery contract applies.

Tests explicitly cover both ambiguous storage outcomes: an exception before any object exists and an exception after the immutable object has already committed. The committed object is recovered without a duplicate write.

Rejected and failed staged bytes are unavailable through accepted-content retrieval. They are not automatically deleted in this release because retention, legal hold, quarantine, and destructive-disposition requirements have not been authorized. Scheduled orphan reconciliation and retention-aware cleanup remain future work.

## Audit minimization

Important lifecycle evidence is generated from authoritative D1/SQLite state changes. Database triggers emit append-only audit evidence for initiated, received, staged, accepted, rejected, and processing-failed facts in the same database transaction as the corresponding authoritative row transition where applicable.

Audit evidence is deliberately minimized. It may include application identifiers, tenant/workspace scope, initiating/acting internal subject identifiers, lifecycle state, bounded failure code, byte length, SHA-256, and accepted media type when relevant.

It does not include content bytes, document contents, original/display filenames, credentials, passwords, bearer tokens, session identifiers/verifiers, OIDC authorization codes, OIDC secrets, private keys, client secrets, or unrestricted provider claims.

## Schema and migrations

Two forward-only migrations are added:

- `migrations/0013_content_ingestions.sql` — application-owned content-ingestion identity, tenant/workspace/initiation ownership, lifecycle, storage reference, integrity fields, lifecycle constraints, immutability, bounded metadata/resource constraints, and disposition protection;
- `migrations/0014_content_ingestion_audit_triggers.sql` — minimized lifecycle audit evidence emitted from authoritative D1/SQLite transitions.

Upgrade coverage proves the supported prior schema through `0012_authenticated_session_verifiers.sql` upgrades through `0013` and `0014` while preserving representative existing document/audit/session invariants. Empty-database migration coverage also proves the complete contiguous sequence.

Released migrations remain immutable and forward-only.

## Security and threat boundary

Controls established by this release include:

- fail-closed tenant/workspace-scoped intake and retrieval;
- server-generated intake/storage identity;
- filename/path/object-key injection resistance;
- caller media type treated only as an untrusted hint;
- bounded materialized content and metadata;
- SHA-256 identity and read-time integrity verification;
- immutable content-store create semantics;
- exact-key/hash/length cross-service reconciliation;
- accepted-only retrieval;
- no false malware-clean claim;
- minimized append-only lifecycle audit evidence; and
- no production upload route or production ingestion composition.

Residual production gates include final allowed-type/signature policy, authoritative malware scanning/quarantine, streaming transport, WAF/rate limits/quotas, storage permissions/monitoring, retention/legal hold/disposition, scheduled orphan reconciliation, complete R2 backup/restore, customer RPO/RTO, customer tenant provisioning, and controlled production deployment.

## Operations and recovery

This release adds deterministic application recovery contracts, not scheduled production recovery automation.

Operational recovery must:

1. re-establish current application authorization;
2. load the intake only through tenant/workspace-scoped D1 identity;
3. use the exact D1-owned storage key and expected SHA-256;
4. verify byte length and SHA-256 before resuming processing;
5. distinguish a committed immutable write from a confirmed missing object;
6. avoid duplicate writes when the expected object already exists;
7. fail closed on missing or integrity-mismatched content; and
8. permit retrieval only when the D1 lifecycle is `accepted` and current read authorization succeeds.

No content-disposition operation is added. Rejected/failed bytes must not be silently purged until retention, legal-hold, quarantine, and destructive-disposition policy is explicitly authorized.

## Validation evidence

A read-only finalized-snapshot validation on the release branch established the following before temporary validation helpers are removed:

- Prettier: PASS;
- ESLint: PASS;
- strict TypeScript: PASS;
- full-history secret scan: PASS;
- Vitest: 67 files / 201 tests passed at that snapshot;
- Worker dry-run build: PASS;
- `pnpm audit --audit-level=high`: PASS with no known vulnerabilities; and
- Playwright Chromium matrix: 134 tests passed, preserving desktop/mobile, responsive, security-header, and axe accessibility coverage.

The protected-main PR-context checks `quality`, `browser`, and `secrets` remain the authoritative merge gates and must pass on the exact final frozen head after temporary validation artifacts are removed. The final orchestrator handoff records those exact-head results.

## Explicitly deferred capabilities

This release does not introduce or authorize:

- production customer upload enablement or public Internet upload endpoints;
- PHI or customer content;
- live production IdP activation;
- production authentication composition changes;
- malware-scanning SaaS or paid antivirus services;
- final allowed-file/signature policy;
- streaming multipart upload transport;
- production WAF/rate-limit/customer quota policy;
- OCR or AI content processing;
- new production Cloudflare infrastructure;
- analytics or tracking;
- customer provisioning;
- broad retention/legal-hold/destructive-disposition implementation;
- scheduled orphan cleanup;
- production RPO/RTO commitments;
- PostgreSQL migration or repository-wide ORM rewrite; or
- any paid service.

Expected new recurring cost for this release is `$0`.

## Recommended next release

After authoritative review and merge, the recommended next release is an explicitly authorized **controlled authenticated staging vertical slice** using only synthetic/non-sensitive content. That release should deliberately decide the transport/composition boundary and any still-required production security gates; this architecture alone must not activate customer uploads.
