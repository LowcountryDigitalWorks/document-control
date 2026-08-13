# Architecture

## Context

Document Control is a tenant-aware modular monolith running at the Cloudflare edge. The current
production-readiness phase favors understandable boundaries, strong document-control invariants,
low operational cost, and deliberate security gates over speculative infrastructure portability or
feature breadth.

```text
HTTP request
  -> Hono application/security middleware
  -> bounded HTTP route modules / semantic server-rendered UI
  -> authorized application services
  -> domain rules (framework independent)
  -> D1/SQLite metadata/state + R2 content adapters
```

Production Readiness Foundation II adds repository operations, migration, supply-chain, and recovery
assurance around this architecture; it does not add a production runtime service.

## Boundaries

- **Domain** owns tenant, workspace, identity/member, role, document/version, controlled template,
  workflow, review, approval, and audit concepts. It imports no Hono, D1, R2, or ORM API.
- **Application** coordinates domain rules, authorization-aware services, input validation, portable
  export contracts, and provider ports. Its current persistence services are materially SQL/SQLite
  coupled because `DatabaseProvider` exposes raw SQL operations.
- **Infrastructure** adapts D1/SQLite and R2 to application ports and owns safe storage-key
  construction. D1/SQLite is the accepted initial production metadata/state-store architecture; a
  different relational implementation is not a drop-in provider swap.
- **HTTP composition** lives under `src/http/`. Route modules consume injected application
  dependencies and do not instantiate D1/R2 adapters. `src/index.ts` is intentionally only the Worker
  composition entrypoint.
- **Presentation** produces semantic HTML. Focused client-side TypeScript may be introduced for
  progressive enhancement when a real interaction requires it; the application is not a SPA.
- **Repository operations** own CI pinning/permissions, migration ordering/upgrade assurance, and
  recovery procedure. They must not become an alternate privileged path around application
  authorization or repository governance.

See [ADR 0002](adr/0002-d1-sqlite-initial-production-persistence.md) for the accepted persistence
posture, [the threat model](THREAT_MODEL.md) for security boundaries, and
[Operations, Migration, Backup, and Recovery](OPERATIONS_RECOVERY.md) for the operational baseline.

## HTTP composition

The Hono application is assembled in `src/http/app.ts`:

- global security headers/CSP are registered once before feature routes;
- `src/http/routes/` groups coherent route families;
- shared synthetic-session and bounded form-reading concerns live in focused HTTP helpers;
- `src/http/dependencies.ts` is the HTTP composition point that creates the D1 adapter,
  authorization policy, and authorized application-service facades; and
- route modules receive that dependency factory instead of importing concrete provider adapters.

This is a modular-monolith boundary, not a second service layer or dependency-injection framework.
Tenant scope, authorization facades, synthetic session isolation, same-origin protections,
exact-version evidence, and current response behavior remain unchanged by Foundation II.
Architecture regression tests prevent the Worker entrypoint from regaining route behavior, prevent
route modules from directly importing D1/R2 infrastructure adapters, and preserve the domain layer's
Hono/infrastructure independence.

## Persistence posture

D1/SQLite is the accepted initial production relational metadata/state store.

The provider-independent architecture primarily protects domain concepts and business/security rules:
tenant isolation, document/template/workflow semantics, exact-version/hash approvals, template
provenance, append-only audit semantics, and application authorization policy. Current application
persistence implementation portability is narrower. `DatabaseProvider` accepts SQL strings and
parameters, and many application reads/writes use SQLite-compatible SQL directly. Replacing the D1
adapter therefore does not make those services PostgreSQL-ready.

Future repository/query ports should be extracted incrementally only when a real production feature,
second persistence requirement, or operational constraint gives a bounded abstraction concrete
value. The project does not plan a universal repository layer, ORM migration, PostgreSQL adapter, or
database rewrite merely for speculative portability.

## Schema authority and evolution

Ordered migrations under `migrations/` are the authoritative executable D1/SQLite schema and
evolution source. They contain relational constraints, indexes, and triggers that enforce critical
invariants. A separately maintained ORM schema is intentionally not authoritative because silent
drift between schema descriptions is more dangerous than the convenience it provides at this stage.

Released migrations are forward-only immutable history. A correction to released schema behavior is
a new next-ordered migration, not an edit to historical SQL.

`scripts/migration-files.ts` provides the repository's deterministic migration discovery/application
logic for tests and local E2E setup. It requires a contiguous four-digit `NNNN_name.sql` sequence and
fails if a migration is malformed, skipped, or reordered. It applies the actual SQL files; it does not
maintain a duplicate schema model.

`tests/unit/migration-upgrade-path.test.ts` establishes the current supported repository path:

- empty supported database -> all migrations through `0011`; and
- immediately prior supported schema through `0010` -> current schema through `0011`.

The prior-schema test seeds representative application data before `0011`, applies the real remaining
migration, and proves that data survives while tenant constraints, append-only audit protection, and
the new change-summary rules remain enforced.

This release does not claim every historical intermediate schema is indefinitely supported. Each
future schema release must state and test the upgrade path it supports.

A typed query layer may be introduced later only where a production need justifies it and it can be
generated from, or mechanically checked against, the executable schema without weakening existing
invariants.

## Tenant isolation

Every tenant-owned record carries `tenant_id`. Composite foreign keys tie workspaces, documents,
document versions, templates, workflow instances, reviews, approvals, and audit records to the same
tenant boundary. The database rejects a record that names tenant A while referencing tenant B's
workspace/document/version.

These relational guarantees complement, but do not replace, application authorization. Every query
must still be scoped to the active tenant and workspace where applicable. Future production routing
must establish authenticated tenant context before protected application services execute.

## Identity and roles

The data model separates application identity metadata from authentication. `identity_subjects`
represent people or external identities without storing passwords, tokens, or other credentials.
`tenant_memberships` connect subjects to tenants.

Role definitions are data, not a hard-coded enum. System defaults establish the initial product roles
(Platform Administrator, Tenant Administrator, Workspace Administrator, Workflow Administrator,
Template Manager, Document Owner, Author, Reviewer, Approver, Auditor, and Viewer), while tenant-owned
custom workspace roles provide bounded operational grants. Role bindings carry platform, tenant, or
workspace scope and are checked against membership and workspace boundaries.

Authentication source remains separate from application authorization. A future identity provider
must normalize external principals/groups into identity subjects, active memberships, and internal
role bindings. Production authentication/SSO/session management is not implemented by this release.
See `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md`.

## Controlled templates

Templates are controlled records with immutable content/provenance per version. Template versions
move through:

`Draft -> Review -> Approved -> Published -> Superseded -> Retired`

The content hash, content location, creator, provenance, and creation timestamp of a template version
cannot be rewritten. Lifecycle timestamps can advance as the version is published or superseded.
Documents created from a template preserve the exact template ID, version number, source hash, and
provenance path. A later template update therefore cannot silently alter an existing document's
origin.

## Versioned workflows

Workflow definitions are versioned data containing their own states and transitions. A workflow
instance records the exact definition ID/version it started with and can transition only according
to that definition. Editing or publishing a later workflow definition does not rewrite an existing
instance's rules or history.

The database additionally verifies that a persisted workflow state exists in the bound definition.

## Content and metadata

D1 stores application metadata, relationships, and evidence. R2 is the initial binary-content
adapter. Application-owned builders create tenant/workspace/document-or-template/version scoped
storage keys; callers do not invent arbitrary object paths.

Version content is create-once. R2 writes use a conditional precondition so an existing version key
cannot be silently overwritten. The application computes SHA-256 from the bytes before writing and
again when reading evidence. R2 custom metadata is informative, not trusted as the source of truth.

The current adapter materializes bytes in memory and is appropriate only for the current
synthetic/foundation stage. It is **not** an arbitrary customer-upload pipeline. Before uploads are
enabled, Content Ingestion Architecture must define allowed types, bounded streaming/size limits,
type/signature validation, quarantine, malware scanning, SHA-256 identity, D1/R2 state transitions,
partial-failure compensation, orphan reconciliation, safe retrieval, and retention/deletion
interaction.

## Approval invariant

An approval records:

- tenant and document;
- exact document-version ID;
- exact SHA-256 content hash;
- approving identity subject;
- exact workflow-instance ID;
- workflow definition ID and version; and
- timestamp.

The database and application layer both require these values to agree. Applicability requires the
exact version ID and hash to match. Creating version 2 does not mutate or extend an approval for
version 1.

## Audit model

Audit events are append-only. SQLite triggers reject updates and deletes. Corrections are new events
that reference what is being corrected; history is not rewritten. Current synthetic audit views are
bounded evidence projections, not a production SIEM/archive or log-retention implementation.

## Portability, backup, and recovery boundary

Export v1 contains tenant/configuration, identity subjects, memberships, role definitions and
bindings, workspaces, documents/versions, templates/versions/provenance, workflow definitions and
instances, reviews, approvals, audit events, and storage references.

Import parsing validates structure, references, tenant boundaries, workflow references, template
provenance, and exact approval evidence before accepting the data. The current JSON portable export
does **not** bundle external R2/SharePoint binaries and is not a complete production backup or
disaster-recovery mechanism.

The architecture distinguishes four recovery concerns:

1. portable application JSON;
2. D1 relational metadata/state recovery;
3. R2 controlled binary/content recovery; and
4. complete recoverable application state, which requires coordinated metadata + binary + schema +
   configuration/deployment mapping and post-restore reconciliation.

D1 and R2 do not provide an application-atomic cross-service transaction. Backup/restore therefore
must account for metadata that refers to missing content, orphan content, hash mismatches, and
restore-point skew. Silent relinking/deletion is not an acceptable generic recovery shortcut because
it can destroy evidence and can conflict with future retention/legal-hold requirements.

`tests/unit/recovery-drill.test.ts` exercises only a deterministic local SQLite reconstruction with
synthetic data. It verifies selected tenant/workspace, document/template hash, workflow, approval,
authorization, schema, foreign-key, and append-only-audit relationships after rebuilding a clean
current schema. It does **not** exercise Cloudflare D1 point-in-time recovery or R2 recovery and does
not establish any customer RPO/RTO.

The future production procedure must capture pre-change state, protect recovery credentials/copies,
restore the correct metadata and content sets, reconcile them, validate exact evidence, and record
human approval for consequential recovery actions. Detailed rules and failure scenarios are in
`docs/OPERATIONS_RECOVERY.md`.

## Repository CI and supply-chain boundary

The permanent `.github/workflows/ci.yml` keeps `permissions: contents: read`, normal
`pull_request`/`main` triggers, and the existing `quality`, `browser`, and `secrets` jobs.

Every `actions/checkout` invocation disables credential persistence. External Actions are pinned to
full official upstream commit SHAs with version comments, and Dependabot remains enabled for the
`github-actions` ecosystem. No validation workflow pushes or uses `pull_request_target`.

Repository unit tests mechanically guard these properties. CodeQL was evaluated but deferred because
the advanced upload workflow normally requires `security-events: write`; Foundation II preserves the
no-write PR validation boundary. Any later CodeQL/default setup or ruleset change is a separate
security/governance decision.

## Security posture

- No arbitrary public/customer uploads are implemented.
- No production authentication, production SSO, or production session management is implemented.
- No production tenant provisioning is implemented.
- No malware scanning or quarantine pipeline is implemented.
- No production retention, legal hold, destructive disposition, scheduled backup/restore, or disaster
  recovery automation is implemented.
- No production Cloudflare D1/R2/Worker/customer environment has been provisioned by repository
  development.
- Customer data and PHI are prohibited in the current synthetic/foundation environment.
- No analytics, trackers, external fonts, or third-party runtime scripts are introduced.
- Strict response headers and an allowlist-oriented Content Security Policy apply to the Hono
  application and have cross-route browser regression coverage.
- Repository CI performs formatting, linting, strict TypeScript, executable migration/invariant and
  upgrade/recovery tests, content-hash tests, browser/accessibility tests, dependency audit, and
  current/history secret detection. Protected `main` requires `quality`, `browser`, and `secrets`.

The formal threat register and unresolved production controls are maintained in
`docs/THREAT_MODEL.md`. That threat model is an engineering artifact, not a compliance
certification/determination.

## Recommended production-readiness sequence

The current high-level sequence is:

1. **Production Readiness Foundation I — Threat Model & Architecture Boundaries** — established;
2. **Production Readiness Foundation II — Operations & Supply-Chain** — current foundation;
3. **Production Identity & Tenant Boundary**;
4. **Content Ingestion Architecture**;
5. an **explicitly approved controlled staging vertical slice** using synthetic/non-sensitive test
   content; and
6. later retention, complete backup/recovery, and customer-readiness gates.

These labels describe sequencing dependencies only. They do not authorize future implementation,
production infrastructure, customer data, PHI, paid services, or deployment changes. Each later gate
requires its own inspection, decision, validation, and approval.
