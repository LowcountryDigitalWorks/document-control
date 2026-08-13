# Document Control Threat Model

- Status: Production Readiness Foundation II baseline
- Date: 2026-08-12
- Scope: `LowcountryDigitalWorks/document-control`

## Purpose and limits

This is the engineering threat model for Document Control. It identifies protected assets, actors,
trust boundaries, current mitigations, future gates, and residual decisions. It is not a
certification, audit opinion, compliance assessment, or determination of suitability for HIPAA,
CMMC, FedRAMP, SOC 2, or another assurance framework.

The repository remains pre-production. Product-shaped interactive routes are synthetic/test-only.
Production Identity & Tenant Boundary I adds provider-neutral authentication/session contracts and
deterministic local/test adapters, but no live identity provider, production session store, or
authenticated production application route is connected. Tenant provisioning, customer uploads,
malware scanning/quarantine, retention/legal hold, complete production backup/recovery, production
Cloudflare resources, customer data, and PHI remain unimplemented and unauthorized.

Foundation II adds CI supply-chain hardening, deterministic migration/upgrade assurance, migration
and recovery discipline, a repository-controlled recovery architecture/runbook, and local synthetic
recovery validation. Those controls do not create a production deployment or establish RPO/RTO.

## Security objectives and invariants

1. Tenant-owned records must not cross tenant boundaries.
2. Authentication source is not application authorization; active membership and internal role
   bindings determine authority.
3. Approval applies only to the exact document-version ID, SHA-256 content identity, workflow
   instance, and workflow-definition version recorded as evidence.
4. Template and workflow histories remain immutable/versioned where defined as evidence.
5. Audit history is append-only; corrections add evidence rather than rewriting history.
6. Browser-supplied IDs, claims, paths, filenames, content types, and role labels are untrusted.
7. Content keys are application-owned references rather than caller-controlled storage paths.
8. Export, administration, migration, backup, recovery, and deployment paths must not bypass ordinary
   authorization or repository governance.
9. Secrets and authentication/recovery material must not enter source control, portable exports,
   migration examples, ordinary audit evidence, or recovery records.
10. Released migrations are forward-only immutable history; corrections use a new ordered migration.
11. Portable JSON, D1 metadata/state recovery, R2 binary recovery, and complete recoverable state are
    distinct concepts.
12. A future security control is not an implemented capability until it is enforced and validated.

## Protected assets

Protected assets include controlled document/template binaries; exact SHA-256 identities and content
references; document/template metadata, immutable versions, lifecycle state, and provenance; workflow
definitions/versions/instances; review and approval evidence; append-only audit records; identity
subjects, memberships, roles, bindings, permissions, and tenant/workspace configuration; portable and
evidence exports; migration files/order/schema state; future session/IdP/scanner state; production
secrets, deployment/recovery credentials and keys; backup/restore material; CI workflow authority and
Action dependencies; branch governance; release artifacts; and future deployment state.

## Actors

### Ordinary authenticated member

A future production user with a validated application identity, active tenant membership, and one or
more internal role bindings. Current synthetic identities exercise authorization logic but do not
constitute production authentication.

### Privileged tenant/workspace administrator

A legitimate administrator with configuration, member, role, workflow, template, export, or
workspace authority. Privilege remains scoped by the application permission model and must be
auditable.

### Platform administrator

A deliberately broad application role. Compromise has high impact and requires stronger production
operational controls and a future break-glass model.

### External identity provider

A future Entra/OIDC/SAML/AD-connected or other approved provider. Provider claims are authentication
input; immutable external identities/groups must normalize into application-owned membership and
role-binding semantics.

### Infrastructure and provider services

Cloudflare Worker, D1, R2, GitHub Actions, dependency sources, and any future approved identity,
scanning, backup, or monitoring providers.

### Release or recovery operator

A future human or service identity performing migration, deployment, backup, restore, credential
rotation, or recovery verification. These are privileged operational boundaries and require minimum
scope plus explicit human approval where consequential.

### Malicious/compromised legitimate user and unauthenticated Internet user

Assume hostile inputs and possible misuse of legitimate authority. Future public login, invitation,
upload, and download paths must be designed against that threat rather than relying on synthetic-demo
assumptions.

### Background/system process

Future scanner, cleanup, reconciliation, migration, backup, restore, notification, or provisioning
processes. Such services require bounded identities and must not implicitly inherit platform admin.

## Trust boundaries

### Browser -> Worker/application

All request metadata, cookies, IDs, form values, filenames, content types, paths, and future uploaded
bytes are untrusted. Current synthetic state-changing routes use server-owned tenant/subject context,
opaque cookies, and same-origin checks; these are not a production session design.

### External IdP -> normalized application identity

Future assertions must validate issuer/audience/signature/state/nonce as appropriate and map immutable
provider identities into application-owned subjects/memberships. Display names, emails, domains, or
arbitrary group labels must not directly grant application permissions.

### Identity -> membership -> role binding -> permission

This is the primary authorization boundary. Active tenant membership and scoped internal role
bindings must authorize protected work before persistence or presentation.

### Application -> D1/SQLite

D1/SQLite is the accepted initial production metadata/state architecture. Application persistence is
materially SQL/SQLite coupled through `DatabaseProvider`; relational constraints/triggers reinforce
critical invariants.

### Application -> R2

R2 is the initial binary-content adapter. Current storage is create-once and SHA-256 verifying. The
adapter is not an approved arbitrary customer-upload pipeline.

### Ordered migrations -> schema state

SQL under `migrations/` is executable schema authority. Foundation II validates contiguous order,
clean creation, and the supported prior-to-current upgrade with real SQL. Production migration
remains a privileged operation requiring pre-change recovery readiness and post-change validation.

### Future upload -> quarantine/validation/scanner -> accepted content

Not implemented. Customer bytes must not enter controlled storage until file policy, bounded
processing, signature/type validation, quarantine, malware scanning, failure compensation, safe
retrieval, and retention interaction are reviewed.

### Export/download boundary

Exports concentrate metadata/evidence and require authorization, bounded projections, safe response
headers, and explicit scope. Existing portable JSON contains external content references and is not a
complete binary backup.

### Backup/recovery boundary

Recovery copies, credentials, keys, restore authority, and provider restore actions are privileged.
D1 and R2 are not one application-atomic recovery unit, so restoration requires sequencing,
SHA-256/invariant checks, and metadata/content reconciliation.

### CI/deployment boundary

A compromised repository workflow, Action dependency, branch rule, repository credential, or future
deployment credential can bypass application controls. Foundation II keeps permanent CI read-only,
disables checkout credential persistence, pins official Actions to immutable SHAs, retains Dependabot
maintenance, and mechanically tests that posture.

## Threat register

Each threat below states the current mitigation followed by the unresolved/future requirement.

### Cross-tenant access and enumeration

Current: tenant IDs live on tenant-owned records; composite relational constraints prevent many
cross-tenant attachments; authorized services scope tenant/workspace IDs; sensitive detail paths avoid
revealing cross-session/cross-tenant existence.

Current: Production Identity & Tenant Boundary I adds normalized authenticated context plus
`DatabaseTenantContextResolver`, which requires active membership and verifies workspace ownership
inside the selected tenant. Browser tenant/workspace IDs are selectors only and denial is generic.

Future/residual: wire this boundary only after a real provider and production session store are
approved, then add end-to-end hostile-ID tests against authenticated production-shaped routes. Tenant
provisioning and live authenticated routing remain unimplemented.

### Privilege escalation and compromised administrators

Current: internal roles/permissions, active membership checks, bounded custom roles, and authorized
facades constrain operations; administrative actions preserve audit evidence.

Future/residual: define production MFA/conditional-access expectations, stale-session/revocation
behavior, role-provisioning ownership, alerting, separation of duties, and break-glass/platform-admin
controls.

### Confused deputy or malicious IdP claims

Current: provider identity does not itself grant application permissions.

Current: provider-neutral principal normalization requires provider + exact issuer + immutable
external subject. `IdentityMappingService` maps only that canonical identity to an application-owned
subject and unknown mappings fail closed; email/display metadata cannot grant authority.

Future/residual: the real provider adapter must validate signatures, issuer/audience, state/nonce and
other protocol requirements before emitting `AuthenticatedPrincipal`. JIT/SCIM/group mapping,
provider deprovisioning, and group ownership remain undecided.

### Session theft/fixation and CSRF

Current: synthetic cookies are server-issued, HttpOnly, SameSite=Strict, path scoped, and Secure on
HTTPS; synthetic mutations require same-origin requests.

Current: provider-neutral `SessionService` enforces opaque 256-bit IDs, bounded lifetime, expiry,
revocation/logout, and rotation that invalidates the prior ID without extending expiry. HTTP
middleware accepts only the separate authenticated-session cookie and passes normalized internal
context; the demo cookie remains isolated.

Future/residual: select a production session store and real IdP binding; validate provider logout and
server-side cleanup; finalize cookie/SameSite/CSRF behavior against the actual redirect flow; and test
session theft/replay/rotation behavior end to end.

### Replay, race, and stale workflow actions

Current: immutable IDs, exact current-version/hash checks, unique constraints, workflow-version
pinning, and application/database stale review/approval guards reject superseded evidence.

Future/residual: production external retries may require idempotency/concurrency contracts and
content-ingestion reservation/reconciliation state.

### Malicious file uploads and metadata/content confusion

Current: arbitrary/customer uploads are absent; application storage keys are application-owned.

Future/residual: Content Ingestion Architecture must define allowed types, size/streaming bounds,
magic/signature/MIME/extension validation, filename normalization, quarantine, malware scanning,
parser isolation, decompression limits, safe serving headers, quotas, and failure policy.

### D1/R2 partial success and orphan state

Current: no false cross-resource transaction claim is made; R2 objects are create-once; recovery
procedure explicitly detects missing metadata/content and hash mismatch rather than silently cleaning
or relinking evidence.

Future/residual: ingestion must define durable state transitions, compensation/retry, idempotency, and
orphan reconciliation. Cleanup cannot be finalized before retention/legal-hold policy.

### Workflow/template/approval evidence tampering

Current: workflow definitions are immutable/versioned; instances are pinned; template versions
preserve exact provenance/content identity; approvals bind exact version/hash/workflow evidence;
database triggers reinforce key invariants.

Future/residual: authenticated staging must exercise hostile identifiers and concurrency. Any future
recovery/import path must preserve the same evidence invariants.

### Audit tampering or leakage

Current: database triggers reject audit update/delete; user-facing audit projections are bounded;
local recovery validation confirms append-only enforcement after reconstruction.

Future/residual: production audit retention, privileged database access, monitoring, archival/SIEM,
and recovery evidence policy remain deployment decisions.

### Export as exfiltration

Current: tenant-wide portability export requires `export.create`; narrower evidence/audit exports use
narrower authorization and no-store/safe response behavior.

Future/residual: real sessions must enforce the same authority. Additional confirmation, dual
approval, alerting, or export-monitoring requirements remain undecided.

### Retention/deletion failure

Current: destructive document deletion is absent; retirement preserves historical evidence; recovery
docs forbid silent orphan cleanup.

Future/residual: retention schedules, legal hold, controlled disposition, content/reference cleanup,
retry/failure evidence, and customer-specific policy remain a later gate.

### Migration skipped, reordered, or released history rewritten

Current: `scripts/migration-files.ts` requires contiguous deterministic migration names/order; E2E and
upgrade tests use the same real SQL; the operational rule is forward-only immutable released history.

Future/residual: every future schema release must extend the expected sequence and supported upgrade
path. Stronger released-migration checksum evidence may be added later if operational value justifies
it.

### Migration failure or application/schema mismatch

Current: upgrade-path tests exercise current SQL, and the operations runbook requires exact version
identification, pre-change state capture, recovery readiness, post-migration invariants, and smoke
checks.

Future/residual: actual deployment tooling, rollback compatibility windows, and operator approval must
be validated against the selected production Cloudflare deployment.

### Backup/restore compromise or incomplete recovery

Current: portable JSON is explicitly not a complete backup; recovery architecture separates D1, R2,
portable export, and complete state; recovery material/credentials/authority are privileged; local
synthetic recovery verifies selected relational/evidence reconstruction only.

Future/residual: define RPO/RTO, independent R2 recovery, backup retention/schedule/encryption/key
ownership, recovery authority, real restore testing, and protected recovery evidence.

### D1/R2 restore-point mismatch or binary hash mismatch

Current: recovery procedure requires missing-object/orphan detection, exact key/version mapping,
canonical SHA-256 validation, and reconciliation before return to service.

Future/residual: complete production D1/R2 reconciliation tooling and an acceptable consistency window
remain undecided.

### Recovery procedure bypasses normal authorization

Current: no production restore tool exists; the runbook requires explicit approval for consequential
restore/resource/credential actions and minimum-scope identities.

Future/residual: define production recovery operator, break-glass, multi-person approval, immutable
recovery evidence, and return-to-service authority.

### Production secret or deployment credential leakage

Current: repository policy forbids committed secrets; CI performs history-aware secret detection;
roles, portable exports, migration examples, and recovery docs exclude credentials.

Future/residual: production secret storage, deployment identity, rotation/revocation, incident
response, and environment protection remain undecided.

### CI dependency compromise

Current: permanent external Actions are pinned to verified official full commit SHAs and Dependabot
GitHub Actions updates remain enabled for reviewable maintenance.

Future/residual: continue reviewing upstream pin changes. Additional provenance/signing controls may
be considered if they add practical value.

### CI credential persistence or workflow privilege escalation

Current: normal CI has `contents: read`, all checkouts use `persist-credentials: false`, no permanent
validation workflow pushes, and regression tests reject write permissions or `pull_request_target`.

Future/residual: any future deployment workflow must be separated from untrusted PR validation and
use minimum scoped deployment identity plus environment approvals.

### Missing static-analysis signal

Current: strict TypeScript, ESLint, unit/invariant/architecture tests, browser/accessibility tests,
dependency audit, secret scanning, and build validation are enforced. CodeQL was evaluated but not
added because an advanced result-upload workflow normally requires `security-events: write`, which is
outside this release's read-only PR posture.

Future/residual: reconsider CodeQL default setup or a separately scoped trusted analysis workflow
under explicit governance approval. It is not a required check in Foundation II.

## Foundation II implemented controls

Foundation II establishes these repository controls without adding a product feature:

- immutable official commit pins for permanent CI Actions;
- `persist-credentials: false` for every permanent CI checkout;
- read-only permanent CI permissions and no `pull_request_target`;
- Dependabot GitHub Actions maintenance for pinned references;
- regression tests for CI pin/credential/permission/trigger posture;
- deterministic contiguous migration discovery/application using actual SQL;
- clean-schema and immediately-prior `0010 -> 0011` upgrade assurance with representative data and
  invariant checks;
- forward-only released-migration discipline and explicit destructive-change approval requirements;
- a durable operations/migration/backup/recovery runbook;
- explicit distinction among portable JSON, D1 recovery, R2 recovery, and complete recoverable state;
- D1/R2 non-atomic consistency and reconciliation requirements;
- documented failure, containment, recovery, validation, and human-approval directions; and
- deterministic local synthetic recovery validation against a fresh migrated SQLite database.

Foundation II does not implement production backup scheduling, R2 recovery, a production restore,
recovery automation, production authentication, customer uploads, production Cloudflare resources,
retention/legal hold, customer data, PHI, PostgreSQL, paid security features, analytics/tracking, or
paid services.

## Production Identity & Tenant Boundary I implemented controls

- Provider-neutral principal normalization uses provider, exact issuer, immutable external subject, and authentication timestamp; optional email/display metadata cannot affect authority.
- Canonical external identity mapping resolves to an application-owned subject and unknown mappings fail closed. No JIT/email-domain enrollment is added.
- Opaque 256-bit session identifiers have explicit bounded lifetime, expiry, revocation/logout, and rotation semantics through an injectable store.
- Only isolated local/test identity and in-memory session adapters are supplied; there is no live provider or production session store.
- Session security events contain only type, internal subject ID, and timestamp.
- Authenticated tenant/workspace context requires current active membership and verifies workspace ownership.
- Existing authorized services continue to re-read role/permission state, so suspension or role removal takes effect despite a valid session.
- Bounded HTTP middleware returns one generic authentication failure and passes no provider claims/tokens into authorization.
- Conservative local/test cookie semantics coexist with unchanged same-origin/CSP/security-header protections.
- Tests mechanically keep the synthetic `/demo` session separate from the production-auth contract.

Residual production work includes live assertion validation, provider/client registration and credentials, production session storage, redirect/login/logout endpoints, MFA/conditional-access policy, provisioning/SCIM/group mapping, deprovisioning, final cookie/CSRF semantics, break-glass administration, monitoring/audit sink, and authenticated controlled staging.

## Security gates before production capabilities

### Production Readiness Foundation I — established

Threat/architecture boundaries, D1/SQLite persistence decision, HTTP decomposition, and architecture/
security regressions remain authoritative.

### Production Readiness Foundation II — current foundation

Repository supply-chain hardening, migration upgrade assurance, migration/recovery discipline,
backup/recovery architecture, and local synthetic recovery assurance are established. This does not
create production disaster recovery.

### Production Identity & Tenant Boundary I — authentication contracts established

Provider-neutral principal normalization, fail-closed identity mapping, session lifecycle semantics,
authenticated tenant/workspace context, bounded HTTP middleware, isolated local/test adapters, and
revocation/cross-tenant tests are established. Live provider assertion validation, production session
storage, provider provisioning/deprovisioning, final redirect/cookie/CSRF semantics, and authenticated
controlled staging remain future gates before production user access.

### Content Ingestion Architecture

Must establish file policy, bounded processing, type/signature validation, quarantine/scanning,
SHA-256 identity, D1/R2 state transitions, partial-failure compensation, orphan reconciliation, safe
retrieval, and retention interaction before customer uploads.

### Explicitly approved controlled staging vertical slice

Only after the relevant preceding gates are approved may a staging environment be explicitly
authorized with synthetic/non-sensitive content. This threat model does not authorize provisioning.

### Later retention, complete backup/recovery, and customer-readiness gates

Retention/legal hold/destruction, complete production backup/restore, monitoring, final deployment
profiles, and regulated-data decisions remain later work. Customer data or PHI must not be introduced
merely to test readiness.

## Review triggers

Revisit this model when production identity/session or tenant provisioning is designed; file upload,
parsing, scanning, or download is designed; a migration changes critical invariants or the supported
upgrade window; a second persistence/content provider is required; production D1/R2/Worker/custom
domain resources are proposed; retention/deletion/backup/recovery is implemented; a production
credential/deployment workflow is proposed; CodeQL or another tool would require new permissions or
ruleset changes; external SIEM/archive/runtime integration is proposed; or an incident/finding
invalidates an assumption here.

Every review must continue distinguishing implemented controls from planned mitigations.
