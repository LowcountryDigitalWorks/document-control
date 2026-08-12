# Document Control Threat Model

- Status: Production Readiness Foundation I baseline
- Date: 2026-08-12
- Scope: `LowcountryDigitalWorks/document-control`

## Purpose and limits

This document describes the security boundaries, assets, actors, threats, existing controls, and
future security gates for Document Control. It is a design and engineering threat model. It is **not**
a certification, audit opinion, compliance assessment, or determination of suitability for HIPAA,
CMMC, FedRAMP, SOC 2, or any other regulatory or assurance framework.

The repository is pre-production. Current interactive product-shaped routes are synthetic/test-only.
Production authentication, production tenant provisioning, arbitrary customer uploads, malware
scanning/quarantine, production retention/legal hold, production backup/recovery, and production
Cloudflare resources are not implemented by this baseline. Customer data and PHI remain prohibited.

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
8. Export, administrative, recovery, and operational paths are security boundaries and must not become
   alternate ways to bypass ordinary authorization.
9. Production secrets and authentication material are never stored in application roles, portable
   exports, source control, or audit evidence.
10. A capability remains unavailable until its security prerequisites are implemented and validated;
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
- future authentication sessions, IdP claims, tokens, anti-CSRF material, and provisioning mappings;
- future quarantine/scanner state and ingestion decision evidence;
- production secrets, deployment credentials, and service bindings;
- migration state, backups, restore material, disaster-recovery records, and recovery credentials;
- CI/CD configuration, workflow authority, branch governance, release artifacts, and deployment state.

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

Cloudflare Worker runtime, D1, R2, future identity/scanning services, and any later approved
infrastructure provider used by the application.

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

Future backups and restores can bypass ordinary request-time controls by operating on complete data
sets. Backup encryption, access control, restoration authorization, integrity verification, and
recovery audit evidence are future production requirements.

### CI/deployment boundary

Repository branch rules, required checks, Actions dependencies, repository credentials, deployment
credentials, release artifacts, and Cloudflare deployment authority can change the software or its
runtime. Compromise here can bypass application controls entirely.

## Threat register

The release gates referenced below are planning labels only; naming a later gate does not authorize
implementation.

| Threat                                                       | Existing mitigation                                                                                                                                                                                                                                              | Planned mitigation / release gate                                                                                                                                                                                | Residual or open decision                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant IDOR or data access                             | Tenant IDs are carried on tenant-owned records; composite foreign keys constrain cross-tenant attachment; authorized services and reads scope tenant/workspace IDs; document/template detail deliberately collapses authorization denial and not-found behavior. | Production Identity & Tenant Boundary must establish authenticated tenant context and ensure every production route uses authorized facades; controlled staging must exercise hostile cross-tenant IDs.          | Production tenant provisioning and authenticated routing are not implemented. Authorization tests must expand with every new production route. |
| Tenant enumeration through response differences              | Current document/template detail paths return the same not-found surface for authorization denial and unknown/cross-session records.                                                                                                                             | Establish a production error-mapping policy before authenticated tenant routing; test timing/body/status behavior on sensitive lookup paths.                                                                     | Administrative and future invitation/login endpoints may need different UX while still avoiding tenant discovery.                              |
| Privilege escalation                                         | Application permissions are internal data; bounded custom roles cannot grant wildcard `*`, `tenant.manage`, `workspace.manage`, or `role.manage`; administrative mutations use authorized facades; DB constraints reinforce scope.                               | Production Identity & Tenant Boundary must test privilege transitions, stale sessions, and admin boundaries with real authenticated identities.                                                                  | Break-glass/platform-administrator controls and production role-provisioning ownership remain undecided.                                       |
| Confused deputy between provider identity and internal roles | Provider type/subject describes identity source only; authorization follows identity -> active membership -> internal role binding -> permission.                                                                                                                | Production identity adapters must map immutable external IDs into the existing internal model and default deny unknown mappings.                                                                                 | Exact supported providers, mapping ownership, JIT/SCIM behavior, and group-to-role approval remain open.                                       |
| Malicious or compromised IdP claims                          | No production IdP is currently trusted. Existing design forbids granting authority from display name/email domain alone.                                                                                                                                         | Validate issuer, audience, signature, nonce/state, authorized tenant configuration, immutable subject/group IDs, and provisioning mappings during Production Identity & Tenant Boundary.                         | IdP-specific claims and conditional-access expectations are undecided.                                                                         |
| Stale authorization after membership suspension/revocation   | Authorization requires active tenant membership; suspension immediately makes new application authorization checks fail while preserving bindings/history.                                                                                                       | Production session design must define revalidation cadence/session revocation and IdP deprovisioning reconciliation.                                                                                             | Whether sessions are revoked immediately, short-lived, or continuously revalidated is unresolved.                                              |
| Compromised administrator                                    | Privileged operations are separated into explicit permissions and produce audit evidence for existing administration. Destructive deletion is intentionally absent.                                                                                              | Production Identity & Tenant Boundary and later operations work must define stronger administrator authentication, break-glass, alerting/review, separation where justified, and recovery controls.              | Required admin MFA/conditional access and independent approval for high-impact actions remain deployment decisions.                            |
| Session theft or fixation                                    | Current synthetic cookie is server-issued UUID, HttpOnly, SameSite=Strict, path-scoped to `/demo`, and Secure on HTTPS. It is explicitly not a production session.                                                                                               | Production Identity & Tenant Boundary must use a production session design with rotation/fixation defense, secure cookie attributes, expiry/revocation, and authentication binding.                              | Production session store/lifetime/provider is unresolved.                                                                                      |
| CSRF                                                         | Current synthetic state-changing POSTs require same-origin `Origin`; synthetic cookies are SameSite=Strict.                                                                                                                                                      | Production session work must define CSRF strategy appropriate to authenticated routes and any cross-site IdP redirects; browser tests must cover it.                                                             | Whether same-origin validation alone remains sufficient for every production mutation depends on final auth/session architecture.              |
| Request replay and idempotency                               | Critical current workflows use immutable IDs, exact current-version checks, unique relational constraints, and no-op handling in several administrative services; approval/review stale-version checks prevent replay onto superseded versions.                  | Production mutation endpoints must classify replay-safe vs one-time commands and add idempotency/concurrency controls where external retries can duplicate side effects.                                         | No general idempotency-key contract exists today.                                                                                              |
| Malicious file upload                                        | Arbitrary/customer uploads are absent; synthetic routes expose no file input.                                                                                                                                                                                    | Content Ingestion Architecture must define allowed types, quarantine, scanning, rejection, lifecycle, and audit evidence before uploads are enabled.                                                             | Scanner/vendor, scan-result semantics, and failure policy remain undecided.                                                                    |
| Dangerous or deceptive metadata                              | Current controlled version metadata is server-generated/bounded in existing synthetic flows; storage keys are application-owned.                                                                                                                                 | Content ingestion must bound/normalize filenames, content types, user descriptions, archive metadata, and other untrusted fields and encode safely on display/export.                                            | Exact filename and metadata preservation policy is unresolved.                                                                                 |
| MIME/content-type/extension confusion                        | No arbitrary upload path exists; stored R2 content type is metadata and SHA-256 is the content-identity anchor.                                                                                                                                                  | Content ingestion must validate magic/signature where practical, compare declared MIME/extension/signature, and define safe serving headers.                                                                     | Allowed file-type matrix and handling of ambiguous formats are unresolved.                                                                     |
| Filename/path handling abuse                                 | R2 object keys are constructed by application-owned builders rather than caller-provided arbitrary paths; evidence exports use fixed/sanitized filenames.                                                                                                        | Future upload/download code must store original display filename separately from object keys, reject controls/path traversal semantics, and use safe `Content-Disposition`.                                      | Final normalization and Unicode filename policy is unresolved.                                                                                 |
| Object-storage key/reference leakage                         | Ordinary document/template evidence views exclude content keys; per-document evidence manifest excludes keys; R2 keys are application-owned. Portable tenant export deliberately includes external content references under tenant-wide export authority.        | Production download APIs must authorize logical records before resolving storage references and avoid exposing direct bucket credentials or unbounded signed URLs.                                               | Whether any customer-facing export should retain raw provider keys or use logical manifests needs later review.                                |
| Upload resource exhaustion                                   | No arbitrary upload exists. Current R2 adapter materializes bytes and is explicitly synthetic/bootstrap appropriate only.                                                                                                                                        | Content Ingestion Architecture must define per-file/request limits, streaming/bounded-memory processing, concurrency/rate limits, and quotas before customer uploads.                                            | Exact limits vary by deployment and allowed content types.                                                                                     |
| Decompression bomb or complex-format denial of service       | No archive/document parsing pipeline exists.                                                                                                                                                                                                                     | Content ingestion must constrain archive expansion, recursion, parser CPU/memory/time, and isolate risky parsing/scanning.                                                                                       | Allowed archive and complex-document formats remain undecided.                                                                                 |
| Race during version creation/upload                          | Current metadata workflow enforces current-version and sequence invariants in services/database; R2 objects are create-once. There is no production cross-resource upload transaction.                                                                           | Content ingestion must define reservation/state transitions, concurrency tokens, idempotent object creation, and reconciliation for competing version submissions.                                               | Exact ingestion state machine and transaction/compensation protocol remain open.                                                               |
| D1/R2 partial success                                        | Repository documentation explicitly does not claim a cross-resource transaction; R2 create-once semantics reduce overwrite risk.                                                                                                                                 | Content Ingestion Architecture must specify order of operations, durable ingestion states, compensating actions, retry behavior, and reconciliation.                                                             | Whether metadata-first or quarantine/object-first ordering best meets operational needs remains to be decided.                                 |
| Orphaned objects or metadata                                 | No production upload orchestration exists, so no cleanup claim is made. Immutable storage keys make orphan identification possible when references are well defined.                                                                                             | Add reconciliation/orphan detection and safe cleanup only after retention/legal-hold interaction is designed.                                                                                                    | Cleanup grace periods, ownership, and legal-hold precedence remain unresolved.                                                                 |
| Workflow-definition or workflow-instance tampering           | Definitions are immutable by version; instances are pinned to exact definition/version; DB triggers constrain state/definition references; lifecycle changes do not rewrite historical instances.                                                                | Production authorization must protect every workflow admin/mutation route; later operations should detect integrity failures and unauthorized direct data changes.                                               | Operational database-access controls and integrity monitoring are deployment decisions.                                                        |
| Exact-version approval/evidence tampering                    | Application and SQLite enforce exact document-version ID, SHA-256, workflow instance, and definition version; stale review/approval evidence is rejected; later versions do not inherit earlier approvals.                                                       | Controlled staging must exercise concurrency and hostile identifiers through authenticated routes; backup/restore must preserve the same invariants.                                                             | Production signing/notarization beyond database/audit integrity is not currently required or selected.                                         |
| Audit tampering or leakage                                   | SQLite triggers reject audit update/delete; corrections are append-only events; ordinary audit views/CSV expose bounded primitive summaries under `audit.read`; raw payloads/subject IDs are not generally exposed.                                              | Operations foundation must define production audit retention, privileged DB access, monitoring, and external archival only if justified.                                                                         | Production log-retention period and external SIEM/archive are unresolved.                                                                      |
| Export as exfiltration                                       | Tenant-wide portable export requires tenant `export.create`; workspace CSV/document evidence are narrower authorized surfaces; downloads use no-store and fixed/sanitized filenames where implemented.                                                           | Production identity/routing must enforce export authority with real sessions; later policy must define export audit/approval and operational monitoring.                                                         | Whether high-impact exports need additional confirmation or dual authorization remains open.                                                   |
| Retention or deletion failure                                | Destructive document deletion is absent; document retirement is terminal and preserves history/evidence; no false retention claim is made.                                                                                                                       | Later retention/customer-readiness gate must define retention schedules, legal hold, disposition evidence, content/reference cleanup, retries, and failed-deletion handling.                                     | Policy, record classes, legal-hold authority, and customer-specific requirements remain undecided.                                             |
| Backup or restore compromise                                 | Current portable JSON export is validated application state with external binary references and is explicitly not a complete production backup.                                                                                                                  | Operations & Supply-Chain Foundation must define migration/backup/recovery procedure; later production work must secure backup storage, encryption, access, integrity verification, restore testing, and audit.  | RPO/RTO, backup provider, key ownership, binary backup model, and retention remain undecided.                                                  |
| Recovery procedure bypasses normal authorization             | No production restore tooling exists.                                                                                                                                                                                                                            | Recovery design must require explicit authorized operators, controlled credentials, immutable recovery logs, integrity checks, and post-restore authorization/state reconciliation.                              | Break-glass recovery approval and emergency access model remain undecided.                                                                     |
| Production secret leakage                                    | Repository policy forbids committed secrets; CI performs current/history-aware secret detection; application roles/exports do not contain credentials by design.                                                                                                 | Operations & Supply-Chain Foundation and deployment design must use scoped deployment secrets, minimal CI permissions, rotation/revocation, and incident procedures.                                             | Final secret store and production deployment credential model are not selected.                                                                |
| CI or deployment compromise                                  | `main` requires PR flow, linear history, resolved review threads, squash merges, and required `quality`, `browser`, and `secrets` checks. CI has read-only repository contents permission.                                                                       | Operations & Supply-Chain Foundation should evaluate immutable Action SHA pinning, checkout credential persistence, CodeQL, deployment-environment protections, artifact provenance, and scoped deploy identity. | Production deployment workflow/resources are not provisioned or authorized.                                                                    |

## Security gates before production capabilities

### Production Readiness Foundation I

This baseline records the threat model, makes the persistence constraint explicit, decomposes HTTP
composition/routes, and adds architecture/security regressions. It does not close production identity
or upload threats.

### Operations & Supply-Chain Foundation

Expected design scope includes migration/backup/recovery procedure, supported-schema upgrade testing,
CI supply-chain hardening, deployment/recovery operational boundaries, and related documentation.
This label does not authorize those changes by itself.

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

### Later retention, backup, and customer-readiness gates

Retention/legal hold/destruction, complete production backup/restore, operational monitoring, final
customer deployment profiles, and regulated-data decisions remain later gates. Customer data and PHI
must not be introduced merely to test readiness.

## Review triggers

Revisit this threat model when any of the following occurs:

- production authentication/session or IdP integration is designed;
- production tenant provisioning is introduced;
- arbitrary file upload, parsing, scanning, or download is designed;
- a second persistence/content provider is required;
- production D1/R2/Worker resources or a custom domain are proposed;
- retention, legal hold, deletion, backup, or recovery is designed;
- external SIEM/archive, notification, workflow automation, or third-party runtime integration is
  proposed;
- a security finding, incident, or changed trust boundary invalidates an assumption here.

Every review should distinguish controls that are already enforced from controls that are only
planned. A planned mitigation must never be represented as an implemented security property.
