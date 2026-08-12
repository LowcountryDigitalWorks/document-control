# Document Control Threat Model

- Status: Production Readiness Foundation II baseline
- Date: 2026-08-12
- Scope: `LowcountryDigitalWorks/document-control`

## Purpose and limits

This document describes the security boundaries, assets, actors, threats, existing controls, and
future security gates for Document Control. It is a design and engineering threat model. It is **not**
a certification, audit opinion, compliance assessment, or determination of suitability for HIPAA,
CMMC, FedRAMP, SOC 2, or any other regulatory or assurance framework.

The repository is pre-production. Current interactive product-shaped routes are synthetic/test-only.
Production authentication, production tenant provisioning, arbitrary customer uploads, malware
scanning/quarantine, production retention/legal hold, complete production backup/recovery, and
production Cloudflare resources are not implemented by this baseline. Customer data and PHI remain
prohibited.

Foundation II adds repository supply-chain hardening, deterministic migration/upgrade assurance,
migration discipline, a documented backup/recovery architecture, and a local synthetic recovery
drill. These controls do not make the repository a production deployment and do not establish a
customer RPO/RTO.

## Security objectives and invariants

The security design aims to preserve these properties as the product moves toward production:

1. Tenant-owned records cannot be read, attached, or mutated across tenant boundaries.
2. Identity source does not directly grant application authority; active membership and internal role
   bindings determine application permissions.
3. A controlled document approval applies only to the exact document-version ID and exact SHA-256
   content identity approved through the exact workflow instance/definition version.
4. Template and workflow histories remain versioned and immutable where the data model defines them
   as evidence.
5. Audit history is append-only; corrections are additional events rather than rewritten evidence.
6. Browser-supplied IDs, names, claims, filenames, content types, paths, and role labels are not
   treated as authority or content identity by themselves.
7. Content storage keys are application-owned references rather than arbitrary user-controlled object
   paths.
8. Export, administrative, recovery, migration, and operational paths are security boundaries and
   must not become alternate ways to bypass ordinary authorization or repository governance.
9. Production secrets and authentication material are never stored in application roles, portable
   exports, source control, migration examples, recovery evidence, or audit evidence.
10. Released migrations remain forward-only immutable history; corrections use a new ordered
    migration and production execution requires recovery readiness.
11. Portable JSON, D1 metadata/state recovery, R2 binary recovery, and complete recoverable
    application state are distinct concepts and must not be conflated.
12. A capability remains unavailable until its security prerequisites are implemented and validated;
    documentation must not imply that a future control already exists.

## Assets

The protected assets include:

- controlled document binaries;
- controlled template binaries;
- document and template metadata, version identities, lifecycle state, and provenance;
- workflow definitions, exact workflow-definition versions, and workflow instances;
- review decisions and comments;
- approvals and exact version/hash/workflow evidence;
- append-only audit records and bounded audit projections;
- identity subjects, tenant memberships, role definitions, role bindings, and permission grants;
- tenant/workspace configuration and presentation/terminology configuration;
- portable exports and evidence exports;
- content-provider references, application-owned object keys, and canonical SHA-256 hashes;
- migration files, ordering, schema state, and migration/recovery evidence;
- future authentication sessions, IdP claims, tokens, anti-CSRF material, and provisioning mappings;
- future quarantine/scanner state and ingestion decision evidence;
- production secrets, deployment credentials, recovery credentials, encryption keys, and service
  bindings;
- backups, restore material, disaster-recovery records, and recovery authority;
- CI/CD configuration, immutable Action references, workflow authority, branch governance, release
  artifacts, and deployment state.

## Actors

### Ordinary authenticated member

A future production user who has an authenticated application identity, active tenant membership, and
one or more internal role bindings. The current synthetic application exercises equivalent
application authorization with server-controlled test identities but does not authenticate users.

### Privileged workspace or tenant administrator

A legitimate administrator with greater configuration, member, role, workflow, template, export, or
workspace authority. Administrative authority is powerful but remains tenant/workspace scoped where
specified and must be auditable.

### Platform administrator

A deliberately broad application role capable of platform-level administration. Compromise or misuse
of this role has high impact and requires stronger operational controls in production.

### External identity provider

A future OIDC, SAML, Microsoft Entra ID, Active Directory-connected, or other approved provider that
asserts external identity. Provider identity must be normalized into application-owned identity,
membership, and role-binding semantics rather than becoming the authorization model itself.

### Infrastructure and provider services

Cloudflare Worker runtime, D1, R2, future identity/scanning services, GitHub Actions, dependency
sources, and any later approved infrastructure provider used by the application.

### Release or recovery operator

A future authorized human or service identity performing deployment, schema migration, backup, restore,
credential rotation, or recovery verification. This actor crosses high-impact operational boundaries
and must use minimum authority with explicit approval where consequential.

### Malicious or compromised legitimate user

An authenticated member or administrator intentionally abusing authority, or a legitimate account
whose browser/session/identity provider has been compromised.

### Unauthenticated Internet user

A user with no trusted application identity. Current production-shaped interactive routes are not
publicly authorized; future public login, upload, download, and invitation entrypoints must assume
hostile Internet input.

### Background or system process

Future scanner, cleanup, reconciliation, migration, backup, restore, notification, or provisioning
processes. These processes require bounded service identity and must not implicitly inherit platform
administrator authority.

## Trust boundaries

### Browser -> Worker/application

All request metadata, URLs, IDs, form values, cookies, filenames, content types, and uploaded bytes are
untrusted at this boundary. The current synthetic application uses server-controlled tenant/subject
context, strict synthetic cookies, and same-origin POST checks; those are not a production login
session design.

### External identity provider -> normalized application identity

Future provider assertions are authentication input only. Immutable provider subject/group identifiers
must map into application-owned identity subjects and provisioning/membership state. Display names,
emails, domains, and arbitrary group labels must not directly grant permissions.

### Identity -> membership -> role binding -> permission authorization

This is the primary authorization boundary. Active membership and internal application role bindings
must be evaluated for the requested tenant/workspace scope before protected work occurs.

### Application -> D1/SQLite

D1 is the accepted initial production metadata/state-store architecture. Application services
currently issue material SQL/SQLite-specific queries through `DatabaseProvider`; relational
constraints and triggers provide defense in depth for critical invariants.

### Application -> R2

R2 is the initial content-store adapter. Current create-once storage verifies SHA-256 on create and
read. The current adapter materializes bytes in memory and is not an approved production upload
pipeline.

### Migration source -> schema state

Ordered SQL under `migrations/` is executable authority. Foundation II validates contiguous ordering,
clean creation, and the supported prior-to-current upgrade path using the real SQL. Production
migration remains a privileged future operation requiring pre-change recovery readiness and
post-change verification.

### Future upload -> quarantine -> validation/scanner -> accepted content

This boundary is not implemented. Arbitrary customer bytes must not enter the controlled-content
store until file policy, bounded streaming, type/signature validation, quarantine, malware scanning,
failure compensation, and safe retrieval are designed and reviewed.

### Export/download boundary

Exports can concentrate sensitive metadata and evidence. Authorization, bounded projections,
no-store responses, safe filenames/headers, and explicit export scope are required. Existing JSON
portability output is application state with external content references, not a complete binary
backup.

### Administrative operations

Member, role, workflow, template, configuration, and future provisioning/retention actions are
privileged state changes. Administrative UI/API paths must not weaken authorization or evidence merely
because the operator is an administrator.

### Backup/recovery boundary

Backup data, recovery copies, credentials, keys, restore authority, and provider restore actions are
privileged. D1 and R2 do not form one application-atomic recovery unit; restoration requires explicit
sequencing, hash/invariant validation, and metadata/content reconciliation. Foundation II documents
this boundary but does not create production backups or recovery automation.

### CI/deployment boundary

Repository branch rules, required checks, Action dependencies, repository credentials, deployment
credentials, release artifacts, and Cloudflare deployment authority can change the software or its
runtime. Compromise here can bypass application controls entirely.

Foundation II keeps normal CI at `contents: read`, disables checkout credential persistence, pins all
permanent external Actions to official full commit SHAs, retains Dependabot GitHub Actions updates,
and mechanically tests the workflow posture. It adds no write-capable PR workflow.

## Threat register

The release gates referenced below are planning labels only; naming a later gate does not authorize
implementation.

| Threat | Existing mitigation | Planned mitigation / release gate | Residual or open decision |
| --- | --- | --- | --- |
| Cross-tenant IDOR or data access | Tenant IDs are carried on tenant-owned records; composite foreign keys constrain cross-tenant attachment; authorized services and reads scope tenant/workspace IDs; detail paths collapse authorization denial and not-found behavior. | Production Identity & Tenant Boundary must establish authenticated tenant context and ensure every production route uses authorized facades; controlled staging must exercise hostile cross-tenant IDs. | Production tenant provisioning and authenticated routing are not implemented. Authorization tests must expand with every production route. |
| Tenant enumeration through response differences | Current document/template detail paths return the same not-found surface for authorization denial and unknown/cross-session records. | Establish a production error-mapping policy before authenticated tenant routing; test timing/body/status behavior on sensitive lookup paths. | Administrative and future invitation/login endpoints may need different UX while still avoiding tenant discovery. |
| Privilege escalation | Application permissions are internal data; bounded custom roles cannot grant wildcard or administrative permission classes; administrative mutations use authorized facades; DB constraints reinforce scope. | Production Identity & Tenant Boundary must test privilege transitions, stale sessions, and admin boundaries with real authenticated identities. | Break-glass/platform-administrator controls and production role-provisioning ownership remain undecided. |
| Confused deputy between provider identity and internal roles | Provider type/subject describes identity source only; authorization follows identity -> active membership -> internal role binding -> permission. | Production identity adapters must map immutable external IDs into the existing internal model and default deny unknown mappings. | Exact supported providers, mapping ownership, JIT/SCIM behavior, and group-to-role approval remain open. |
| Malicious or compromised IdP claims | No production IdP is currently trusted. Existing design forbids granting authority from display name/email domain alone. | Validate issuer, audience, signature, nonce/state, authorized tenant configuration, immutable subject/group IDs, and provisioning mappings during Production Identity & Tenant Boundary. | IdP-specific claims and conditional-access expectations are undecided. |
| Stale authorization after membership suspension/revocation | Authorization requires active tenant membership; suspension immediately makes new application authorization checks fail while preserving bindings/history. | Production session design must define revalidation cadence/session revocation and IdP deprovisioning reconciliation. | Immediate revocation vs short-lived/continuously revalidated sessions remains unresolved. |
| Compromised administrator | Privileged operations are separated into explicit permissions and existing administration produces audit evidence. Destructive document deletion is intentionally absent. | Production Identity & Tenant Boundary and deployment operations must define stronger administrator authentication, break-glass, alerting/review, separation where justified, and recovery controls. | Required admin MFA/conditional access and independent approval for high-impact actions remain deployment decisions. |
| Session theft or fixation | Current synthetic cookie is server-issued UUID, HttpOnly, SameSite=Strict, path-scoped to `/demo`, and Secure on HTTPS. It is explicitly not a production session. | Production Identity & Tenant Boundary must use a production session design with rotation/fixation defense, secure cookie attributes, expiry/revocation, and authentication binding. | Production session store/lifetime/provider is unresolved. |
| CSRF | Current synthetic state-changing POSTs require same-origin `Origin`; synthetic cookies are SameSite=Strict. | Production session work must define CSRF strategy appropriate to authenticated routes and any cross-site IdP redirects; browser tests must cover it. | Whether same-origin validation alone remains sufficient for every production mutation depends on final auth/session architecture. |
| Request replay and idempotency | Critical workflows use immutable IDs, exact current-version checks, unique relational constraints, and stale-version guards. | Production mutation endpoints must classify replay-safe vs one-time commands and add idempotency/concurrency controls where external retries can duplicate side effects. | No general idempotency-key contract exists today. |
| Malicious file upload | Arbitrary/customer uploads are absent; synthetic routes expose no file input. | Content Ingestion Architecture must define allowed types, quarantine, scanning, rejection, lifecycle, and audit evidence before uploads are enabled. | Scanner/vendor, scan-result semantics, and failure policy remain undecided. |
| Dangerous or deceptive metadata | Current controlled version metadata is server-generated/bounded in existing synthetic flows; storage keys are application-owned. | Content ingestion must bound/normalize filenames, content types, descriptions, archive metadata, and other untrusted fields and encode safely on display/export. | Exact filename and metadata preservation policy is unresolved. |
| MIME/content-type/extension confusion | No arbitrary upload path exists; stored R2 content type is metadata and SHA-256 is the content-identity anchor. | Content ingestion must validate magic/signature where practical, compare declared MIME/extension/signature, and define safe serving headers. | Allowed file-type matrix and ambiguous-format handling are unresolved. |
| Filename/path handling abuse | R2 object keys are constructed by application-owned builders rather than caller-provided arbitrary paths; evidence exports use fixed/sanitized filenames. | Future upload/download code must store original display filename separately from object keys, reject controls/path traversal semantics, and use safe `Content-Disposition`. | Final normalization and Unicode filename policy is unresolved. |
| Object-storage key/reference leakage | Ordinary evidence views exclude content keys; per-document evidence manifest excludes keys; R2 keys are application-owned. Tenant portable export deliberately includes external content references under tenant-wide export authority. | Production download APIs must authorize logical records before resolving storage references and avoid exposing direct bucket credentials or unbounded signed URLs. | Whether customer-facing exports should retain raw provider keys or use logical manifests needs later review. |
| Upload resource exhaustion | No arbitrary upload exists. Current R2 adapter materializes bytes and is explicitly foundation-stage only. | Content Ingestion Architecture must define per-file/request limits, streaming/bounded-memory processing, concurrency/rate limits, and quotas before customer uploads. | Exact limits vary by deployment and allowed content types. |
| Decompression bomb or complex-format denial of service | No archive/document parsing pipeline exists. | Content ingestion must constrain archive expansion, recursion, parser CPU/memory/time, and isolate risky parsing/scanning. | Allowed archive and complex-document formats remain undecided. |
| Race during version creation/upload | Current metadata workflow enforces current-version/sequence invariants and R2 objects are create-once. There is no production cross-resource upload transaction. | Content ingestion must define reservation/state transitions, concurrency tokens, idempotent object creation, and reconciliation for competing submissions. | Exact ingestion state machine and transaction/compensation protocol remain open. |
| D1/R2 partial success | Documentation explicitly does not claim a cross-resource transaction; R2 create-once semantics reduce overwrite risk. Recovery docs likewise treat D1 and R2 as separate consistency components. | Content Ingestion Architecture must specify order of operations, durable ingestion states, compensating actions, retry behavior, and reconciliation. | Metadata-first vs quarantine/object-first ingestion ordering remains unresolved. |
| Orphaned objects or metadata | No production upload orchestration exists. Recovery procedure explicitly requires orphan/missing-object detection and forbids silent generic cleanup. | Add safe reconciliation/cleanup only after retention/legal-hold interaction is designed. | Cleanup grace periods, ownership, and legal-hold precedence remain unresolved. |
| Workflow-definition or workflow-instance tampering | Definitions are immutable by version; instances are pinned to exact definition/version; DB triggers constrain state/definition references; lifecycle changes do not rewrite history. | Production authorization must protect every workflow route; later operations should detect integrity failures and unauthorized direct data changes. | Operational database-access controls and integrity monitoring are deployment decisions. |
| Exact-version approval/evidence tampering | Application and SQLite enforce exact document-version ID, SHA-256, workflow instance, and definition version; stale review/approval evidence is rejected. Local recovery drill revalidates exact approval/version/hash relationships after synthetic reconstruction. | Controlled staging must exercise concurrency and hostile identifiers through authenticated routes; complete production recovery must preserve the same invariants. | Production signing/notarization beyond database/audit integrity is not currently required or selected. |
| Audit tampering or leakage | SQLite triggers reject audit update/delete; corrections are append-only events; ordinary audit views/CSV expose bounded primitive summaries. Local recovery drill verifies append-only protection remains after reconstruction. | Future operations must define production audit retention, privileged DB access, monitoring, and external archival only if justified. | Production log-retention period and external SIEM/archive are unresolved. |
| Export as exfiltration | Tenant-wide portable export requires tenant `export.create`; workspace CSV/document evidence are narrower authorized surfaces; downloads use no-store and safe filenames. | Production identity/routing must enforce export authority with real sessions; later policy must define export audit/approval and monitoring. | Whether high-impact exports need additional confirmation or dual authorization remains open. |
| Retention or deletion failure | Destructive document deletion is absent; document retirement is terminal and preserves history/evidence; no false retention claim is made. Recovery docs prohibit silent orphan cleanup. | Later retention/customer-readiness gate must define schedules, legal hold, disposition evidence, content/reference cleanup, retries, and failed-deletion handling. | Policy, record classes, legal-hold authority, and customer-specific requirements remain undecided. |
| Migration skipped or reordered | `scripts/migration-files.ts` requires contiguous ordered migration filenames; E2E setup and tests use that loader. Upgrade tests assert the exact current sequence and deliberate skip/reorder failures. | Continue extending the exact expected sequence and supported prior-to-current path with every schema release. | Future support window beyond the immediately prior schema must be decided per release. |
| Released migration rewritten | Foundation II documents released migrations as forward-only immutable history; corrections require new ordered migrations. Git review/history provides change visibility. | Future deployment governance may add stronger mechanical historical-migration checksum/change detection if justified. | Exact release-to-migration checksum evidence format is not selected. |
| Migration fails or app/schema versions mismatch | Upgrade-path tests exercise real SQL; operations runbook requires exact deployed/schema identification, pre-change state capture, recovery readiness, post-migration invariants, and smoke checks. | Actual production tooling/procedure must be validated against the selected Cloudflare deployment before use. | Production operator model, release tooling, and supported rollback compatibility window remain open. |
| Backup or restore compromise | Portable JSON is explicitly not a complete backup. `docs/OPERATIONS_RECOVERY.md` distinguishes D1, R2, portable export, and complete state; recovery data/credentials/authority are privileged. Local synthetic recovery verifies selected relational/evidence reconstruction only. | Future production work must secure recovery copies, encryption, access, retention, restore testing, R2 recovery, and audit evidence. | RPO/RTO, backup provider/storage, R2 recovery mechanism, key ownership, schedule, retention, and recovery authority remain undecided. |
| D1 and R2 restore-point mismatch | Recovery design requires missing-object/orphan/hash reconciliation and restoration sequencing; canonical SHA-256 provides content identity. | Production recovery must implement/validate reconciliation against real D1/R2 recovery mechanisms before customer data. | Full reconciliation tooling and allowable consistency window are unresolved. |
| Recovery procedure bypasses normal authorization | No production restore tooling exists. Operations baseline requires explicit human authorization for consequential restore/resource/credential actions, minimum-scope identities, protected credentials, validation, and recovery evidence. | Deployment design must implement the operator/break-glass model and audit trail. | Multi-person approval, emergency access, and return-to-service authority remain undecided. |
| Production secret leakage | Repository policy forbids committed secrets; CI performs current/history-aware secret detection; application roles/exports/recovery examples exclude credentials. | Deployment design must use scoped production secrets, rotation/revocation, and incident procedures. | Final secret store and deployment credential model are not selected. |
| CI dependency compromise | Permanent CI Actions are pinned to official full commit SHAs; Dependabot GitHub Actions updates remain enabled for reviewable maintenance. Unit regression checks reject floating Action tags. | Continue reviewing upstream pin changes; consider further provenance/signing controls if justified. | Policy for pin-update review cadence and provenance beyond upstream repository identity is not formalized. |
| CI credential persistence or workflow privilege escalation | Normal CI has `contents: read`; every checkout uses `persist-credentials: false`; regression tests reject write permissions and `pull_request_target`; validation does not push. | Future deployment workflows, if authorized, must be separated from untrusted PR validation and use minimum scoped identity/environment protections. | Production deploy identity/environment approval model is unresolved. |
| Missing static-analysis signal | Existing strict TypeScript, ESLint, unit/invariant, browser, dependency, secret, and architecture checks are enforced. CodeQL was evaluated but not added because advanced result upload normally requires `security-events: write`, conflicting with this release's no-write PR boundary. | Revisit CodeQL/default setup or a separately scoped non-PR analysis design under explicit security/governance approval. | Whether/when CodeQL becomes valuable enough to add a write permission or separate trusted trigger remains open. |

## Foundation II implemented-control boundary

Production Readiness Foundation II establishes these repository controls:

- normal CI keeps `permissions: contents: read`;
- all permanent checkouts use `persist-credentials: false`;
- all permanent external Actions are pinned to verified official full commit SHAs with Dependabot
  GitHub Actions maintenance retained;
- repository tests protect the Action pinning, credential, permission, and trigger posture;
- CodeQL is documented as evaluated/deferred rather than silently enabled with new write authority;
- migration discovery/application is deterministic and rejects malformed/skipped/reordered history;
- clean schema creation and the supported immediately-prior `0010 -> 0011` upgrade are exercised with
  real migration SQL;
- representative records and critical relational/evidence invariants are checked after upgrade;
- released-migration immutability, pre-change state capture, post-migration verification, failure
  recovery direction, and destructive-change approval are documented;
- portable JSON, D1 state recovery, R2 binary recovery, and complete recoverable application state
  are explicitly distinguished;
- D1/R2 non-atomic recovery consistency and reconciliation requirements are documented;
- failure scenarios and future production migration/restore verification steps are defined; and
- a deterministic local synthetic recovery drill rebuilds a clean current SQLite database and
  verifies selected relationships/hashes/evidence.

Foundation II does **not** implement production backup scheduling, R2 recovery, production restore,
recovery automation, RPO/RTO, production deployment credentials/resources, authentication, customer
uploads, customer data, PHI, retention/legal hold, or paid services.

## Security gates before production capabilities

### Production Readiness Foundation I — established

Foundation I records the threat model, accepted D1/SQLite persistence posture, decomposed HTTP
composition/routes, and architecture/security regressions. It does not close production identity or
upload threats.

### Production Readiness Foundation II — Operations & Supply-Chain — current foundation

Foundation II establishes repository supply-chain hardening, supported-schema upgrade testing,
migration discipline, backup/recovery architecture/runbook, and local synthetic recovery assurance.
It does not create a production deployment or complete disaster-recovery capability.

### Production Identity & Tenant Boundary

Must establish real authentication/session semantics, authenticated tenant context, provisioning,
IdP normalization/mapping, revocation/deprovisioning behavior, production CSRF/session controls, and
hostile cross-tenant authorization tests before production user access.

### Content Ingestion Architecture

Must define allowed content, bounded streaming, type/signature validation, quarantine, scanning,
SHA-256 identity, D1/R2 state transitions, partial-failure compensation, orphan reconciliation, safe
retrieval, and retention/deletion interaction before customer uploads.

### Explicitly approved controlled staging vertical slice

Only after the preceding relevant designs are approved may a staging environment be explicitly
authorized using synthetic/non-sensitive test content to exercise real identity, storage, scanning,
and workflow integration. Creating such infrastructure is not authorized by this threat model.

### Later retention, complete backup/recovery, and customer-readiness gates

Retention/legal hold/destruction, complete production backup/restore, operational monitoring, final
customer deployment profiles, and regulated-data decisions remain later gates. Customer data and PHI
must not be introduced merely to test readiness.

## Review triggers

Revisit this threat model when any of the following occurs:

- production authentication/session or IdP integration is designed;
- production tenant provisioning is introduced;
- arbitrary file upload, parsing, scanning, or download is designed;
- a new migration changes critical invariants or the supported schema-upgrade window;
- a second persistence/content provider is required;
- production D1/R2/Worker resources or a custom domain are proposed;
- retention, legal hold, deletion, backup, or recovery is implemented;
- a production deployment/credential workflow is proposed;
- CodeQL or another security tool would require new repository permissions or ruleset changes;
- external SIEM/archive, notification, workflow automation, or third-party runtime integration is
  proposed; or
- a security finding, incident, or changed trust boundary invalidates an assumption here.

Every review should distinguish controls that are already enforced from controls that are only
planned. A planned mitigation must never be represented as an implemented security property.
