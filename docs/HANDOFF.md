# Document Control Handoff

## Authority

`main` is the authoritative product source after each approved pull request is merged. Before any new
work, inspect current `main`, open/recent pull requests, `README.md`, `docs/STATUS.md`, migrations,
workflow/tests, and the latest GitHub Actions results rather than relying on this file alone.

Repository: `LowcountryDigitalWorks/document-control`

The repository is intentionally public by owner decision. Package metadata remains `private: true`
only to prevent accidental package-registry publication. No production customer deployment, customer
data, arbitrary uploads, paid service, analytics, or production authentication is authorized by the
current repository state.

## Current architecture

- TypeScript + Hono modular monolith targeting Cloudflare Workers.
- D1/SQLite for relational application metadata behind `DatabaseProvider`.
- R2 as the initial binary-content provider behind `ContentStore`.
- Ordered SQL files in `migrations/` are the authoritative executable schema/evolution source.
- Application-owned content keys and SHA-256 content identity protect version/object integrity.
- Provider-neutral identity subjects, memberships, configurable roles, scoped role bindings, and
  permission evaluation keep authorization independent from future authentication/SSO.
- Authentication source is not authorization: `local`, `oidc`, `saml`, `entra`, and `external`
  subjects resolve into the same application-owned membership/role-binding model.
- A small customer may use directly provisioned/app-managed membership and roles without an
  enterprise directory. Future Entra ID/Active Directory-connected, OIDC, or SAML deployments should
  map external principals/groups into the same internal roles instead of replacing the permission
  model.
- Workflow definitions are immutable/versioned; workflow instances execute the exact version they
  started with.
- Controlled templates are versioned and preserve exact source provenance.
- Approvals bind an actor and timestamp to exact document-version/hash/workflow evidence.
- Audit records are append-only.
- Portable export is versioned and validates structure, references, tenant boundaries, provenance,
  workflow evidence, approvals, roles/bindings, workspace workflow selection, and workflow lifecycle
  information.

See `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md` for the durable identity-provider / authorization
separation and future group-mapping requirements.

## Implemented product slices

The synthetic/test-only application now covers:

- persisted document workflow lifecycle;
- provider-neutral authorization;
- guided workflow execution;
- workspace Overview, Documents, Templates with read-only immutable version evidence, document evidence with versioned JSON manifest export, and queue-native Reviews & Approvals actions;
- bounded metadata search/filtering;
- Backup & Portability export;
- Audit Log with bounded workspace CSV evidence export;
- tenant presentation administration;
- provider-neutral tenant member administration with direct app-local provisioning and Staged / Active /
  Suspended membership lifecycle;
- workspace Roles & Access assignment administration;
- tenant-owned custom workspace role creation/editing with bounded operational permissions,
  tenant-wide assignment-impact acknowledgement, and terminal non-destructive retirement;
- immutable Workflow Definition administration with exact-version draft cloning, server-side graph analysis, and unreachable-state rejection for newly submitted drafts;
- controlled Template Lifecycle administration with linear exact-version unchanged-content Draft revision creation;
- workspace Workflow Selection/default-version administration; and
- controlled Workflow Definition lifecycle administration; and
- controlled document retirement with terminal historical-only semantics and preserved evidence.

See `docs/STATUS.md` and Git history for the detailed invariant/test record for each merged slice.

## Tenant member lifecycle and provisioning boundary

Tenant membership is application-owned and separate from the authentication provider.

- The member administration surface requires tenant-level `tenant.manage`.
- Directly provisioned members use the `local` provider marker and store identity metadata only; no
  password, MFA secret, token, recovery code, or invitation credential is created.
- User-facing membership states are **Staged**, **Active**, and **Suspended**. Staged is stored as
  `invited`, but no invitation email is sent by the current slice.
- Active is the authorization-eligible state. The existing authorization policy already denies
  tenant/workspace access when membership is not active.
- Suspension preserves tenant/workspace role bindings, provider attribution, and historical/audit
  references rather than deleting them.
- A tenant administrator cannot suspend their own current membership from this surface.
- Direct provisioning rejects a duplicate email already represented by another member of the same
  tenant.
- Externally sourced subjects, including Entra-backed identities, use the same membership lifecycle;
  changing application membership does not modify the external identity provider.
- Member deletion is intentionally not implemented.

Future production identity work must decide authentication, invitation delivery, Entra/AD/OIDC/SAML
provisioning, JIT/SCIM synchronization, group mapping, and deprovisioning reconciliation separately.

## Custom role and identity boundary

Tenant-owned custom workspace roles are application authorization objects, not identity-provider
objects.

- Custom roles may use the bounded operational permission set exposed by the application.
- They cannot grant wildcard `*`, `tenant.manage`, `workspace.manage`, or `role.manage`.
- Built-in system roles remain immutable and continue to carry administrative authority.
- Creating or editing a custom role requires tenant-level `tenant.manage` plus current-workspace
  `role.manage`.
- Assigning an existing eligible workspace role remains a current-workspace `role.manage` action.
- When a custom role has assignments anywhere in the tenant, its edit surface shows those affected
  member/workspace assignments and requires explicit acknowledgement before changing the role.
- Custom-role changes append `role.definition.created` / `role.definition.updated` evidence to the
  existing audit stream.
- Custom roles and their bindings are already represented by the existing portable export model.
- A tenant-owned custom workspace role may be retired only after every tenant assignment is removed.
  Retirement is terminal: the definition and permissions remain visible for audit/export history, but
  the role cannot be edited, reactivated, or assigned again. Database triggers independently enforce
  the zero-binding requirement and block new bindings to a retired role.
- Retirement appends `role.definition.retired` to the existing audit stream and portable export carries
  optional `retiredAt` metadata.

Custom-role hard deletion is intentionally not implemented. Preserve retired role definitions and
historical evidence rather than introducing destructive cleanup.

Do **not** couple custom roles to Microsoft-specific group names or claims. A future Entra ID/AD/OIDC/
SAML provisioning or mapping adapter should resolve immutable external subject/group identifiers to
these application roles. Small customers can use the same roles directly without an external IdP.

## Workflow authoring boundary

Workflow authoring remains version-oriented and server controlled.

- An administrator may choose an exact historical workflow-definition version as a starting point for
  a new draft. This is a copy-for-editing operation only; it never mutates or reactivates the source.
- Saving a next-version draft still inserts the next immutable version in the selected workflow family.
- **Analyze draft** is read-only and reports graph structure without creating audit evidence or
  persistence because no product state changes.
- Newly submitted drafts reject unreachable states from the first/initial state. Keep this safeguard at
  the authoring boundary rather than retroactively invalidating historical definitions.
- Cycles and workflows without terminal states are reported by analysis but are not categorically
  forbidden because continuous/rework workflows may intentionally use them.
- Do not silently add automatic running-instance migration, graphical scripting, conditions, timers,
  or external automation semantics without a separate design decision and invariant review.

## Workflow Definition lifecycle terminology

User-facing administration uses three distinct lifecycle labels:

- **Active** — available for new workspace assignment and new default selection.
- **Legacy** — existing workspace use may continue, but the version cannot be newly assigned or newly
  selected as a default. It may be returned to Active.
- **Retired** — terminal historical-only state. The exact version must be removed from every workspace
  before retirement.

The canonical persisted/exported machine value for **Legacy** is `deprecated`. Do not expose
“Deprecated” as the normal product label; retain it only as the internal schema/domain/export value
unless a deliberate migration changes that contract later.

Lifecycle changes never rewrite workflow-definition content. Existing workflow instances, reviews,
approvals, and audit evidence remain pinned to their original exact workflow version.

## Reviews and Approvals action boundary

- Review and approval work remains derived from the current persisted workflow instance; no second task/queue table exists.
- Ordinary Reviewer/Approver queue cards may execute the same `recordReview` and `approveCurrentVersion` application services used by the guided lifecycle. Do not create an alternate mutation path.
- Reviewer actions are limited to **Accept** and **Request changes** from this surface. Requested changes require a bounded comment; accepted reviews may include an optional comment.
- Approval requires explicit exact-version confirmation and remains bound to the workflow instance, workflow-definition version, current document-version ID, and SHA-256 evidence.
- Queue routes keep actor/tenant/workspace authority server controlled, require same-origin POSTs, and rely on the existing `document.review` / `document.approve` authorization facades.
- The service and migration `0010_current_workflow_action_integrity.sql` both reject review/approval evidence for a superseded workflow version. Preserve this defense-in-depth invariant in future adapters or action surfaces.
- This is still synthetic/test-only. Assignment/delegation, notifications, due dates, escalation, production authentication, and external workflow automation remain separate future decisions.

## Document evidence manifest boundary

- The document detail read model remains the authoritative source for per-document provenance, immutable versions/hashes, workflow/review evidence, approvals, and document-related audit events.
- An authorized evidence reader may download a versioned `document-evidence/v1` JSON manifest for the same document. The route reuses the existing `document.read` plus `audit.read` authorization path and synthetic-session isolation.
- The manifest includes stable document/workflow/review/approval identifiers, actor display names, exact hashes, source-template provenance, workflow-definition versions, timestamps, and at most six primitive audit payload fields per event.
- Tenant ID, internal actor/creator subject IDs, content keys, binary content, nested/raw audit payload objects, and unrelated workspace/tenant records are excluded.
- Evidence export is read-only, uses `Cache-Control: no-store`, and remains available for retired historical records. It is not a binary backup, legal archive, eDiscovery package, retention mechanism, or external records-management integration.

## Controlled template evidence boundary

- Ordinary authorized template readers can open `/demo/app/templates/:templateId` from the normal Templates list and inspect the immutable version lineage without entering Template Lifecycle administration.
- The read path requires existing workspace-scoped `template.read` and remains tenant/workspace/template bounded; authorization denial and not-found use the same 404 response.
- Evidence includes exact version number, lifecycle state, SHA-256 identity, provenance, creator display name, creation timestamp, published/superseded timestamps, and the current-version marker.
- Content provider/key values, creator subject IDs, audit payloads, document-usage records, and unrelated tenant/workspace records are deliberately excluded from this view.
- This surface is read-only. Lifecycle mutation remains in the separately authorized Template Lifecycle administration service and no new mutation path is introduced.
- The template evidence page is not a binary download, template export, upload/content-replacement flow, retention/archive mechanism, or production integration.

## Controlled document retirement

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

## Template revision authoring boundary

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

## Audit evidence export boundary

- The workspace Audit Log remains a read over the existing append-only `audit_events` ledger.
- An authorized Auditor may export the same current workspace/filter view as CSV; export reuses the existing `audit.read` decision, literal bounded search, newest-first ordering, and 100-record cap.
- CSV contains only fields already represented by the Audit Log read model plus the existing four-item primitive payload summary. It does not expose unrestricted raw `payload_json` or actor subject IDs.
- Spreadsheet-formula prefixes are neutralized before CSV encoding, and the response is `Cache-Control: no-store`.
- This is a local/synthetic evidence convenience, not external SIEM integration, long-term archival, production audit retention, or a complete audit data warehouse/export API.

## Synthetic application boundary

Interactive synthetic routes are disabled unless `DEMO_MUTATIONS_ENABLED=true`.

The browser supplies navigation/form actions only. Tenant, workspace, identity, role, permission,
workflow, template, and document authority remain server-controlled. Synthetic browser contexts use
opaque HttpOnly, SameSite=Strict session namespaces and are independently isolated.

Same-origin mutation protection remains required.

**Do not enable the interactive application on a shared public deployment yet.** A one-hour browser
cookie does not purge D1 records. Public enablement requires deliberate server-side session
expiration/purge, quotas, rate limiting, Turnstile or equivalent abuse controls, operational cleanup,
and validation before it can be considered safe.

## Production boundaries still unresolved

Do not imply these are implemented or approved:

- production authentication/SSO/provider configuration;
- Entra ID/Active Directory/OIDC/SAML application registration or connection;
- production invitation delivery, external identity provisioning, JIT/SCIM-style synchronization,
  or identity-provider/group mapping;
- tenant/platform role-assignment administration or system-role editing;
- custom-role hard deletion;
- arbitrary/customer file uploads;
- upload orchestration across D1 and binary storage;
- malware scanning, file-type/size policy, quarantine, or failure compensation;
- production D1/R2/Worker provisioning or custom-domain attachment;
- complete binary backup/restore, retention automation, legal hold, disaster recovery, or external evidence-package archival;
- drag-and-drop/graphical workflow authoring, conditional expressions, timers, scripting, or automatic migration beyond the current immutable versioning, exact-version draft cloning/analysis, and lifecycle controls;
- template binary/content replacement or upload, new-template-family upload flows, and storage/scanning orchestration;
- full-text/content-body search or external search infrastructure;
- PostgreSQL/SharePoint production adapters;
- external audit/SIEM archival, unrestricted raw audit-payload export, or production audit-log retention policy;
- analytics, AI services, or paid SaaS dependencies.

Any production infrastructure or recurring-cost change requires current-state inspection, proposed
state, rollback, and Eddie's explicit approval.

## Normal development and validation

Use branches and pull requests for meaningful changes. Normal pull-request CI is intentionally
read-only. Temporary maintenance helpers must not remain in a final pull-request diff.

Expected validation includes, as applicable:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm secrets:scan
pnpm test:unit
pnpm build
pnpm test:e2e
pnpm audit --audit-level=high
```

The exact final pull-request head should pass the normal `quality`, `browser`, and `secrets` jobs
before merge. Preserve existing accessibility, responsive, tenant-isolation, authorization,
exact-version evidence, cross-origin, portability, and history-aware secret-scan coverage.

## Continuation procedure

At the start of a replacement development chat:

1. Confirm the connected GitHub identity is `Eddie-LowcountryDigitalWorks`.
2. Inspect `LowcountryDigitalWorks/document-control` current `main` and all open/recent PRs.
3. Read `README.md`, `docs/STATUS.md`, this handoff, `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md`,
   migrations, package/lock files, CI, and tests.
4. Confirm there are no failed or unfinished maintenance/dependency PRs that should be resolved first.
5. Reconcile the roadmap against the actual merged product state before choosing the next slice.
6. Keep production infrastructure, customer data, arbitrary uploads, authentication-provider
   selection/configuration, and paid services outside scope unless Eddie explicitly approves the
   relevant design and change-control boundary.

Do not resume from old milestone numbers or old “next slice” text without live repository inspection.

## Immutable document-version change-summary boundary

- Migration `0011_document_version_change_summary.sql` adds a bounded change summary to exact document versions, backfills pre-feature versions with an explicit historical marker, rejects new inserts that omit a real summary, and prevents later summary rewrites.
- Initial template-derived versions receive a server-controlled initial-version summary; changed versions must provide a trimmed 3–500 character summary with control characters rejected before persistence.
- The summary is metadata about why an exact version exists. It does not represent rich authoring, file replacement, upload, malware scanning, or content transformation.
- Document detail and `document-evidence/v1` show the summary next to the exact version/hash. Tenant portable export v1 includes the additive optional `changeSummary` field so older v1 packages remain valid.
- New recurring cost is $0; no production resources are introduced.

## Production Readiness Foundation I boundary

The repository has entered a production-readiness phase. Do not resume adding unrelated synthetic feature breadth merely because the synthetic application can support it.

- D1/SQLite is the accepted initial production metadata/state-store architecture. Domain/business rules remain provider-independent, but the current application persistence implementation is materially SQL/SQLite coupled because `DatabaseProvider` exposes raw SQL. A different provider is not a drop-in PostgreSQL capability. See ADR 0002.
- `src/index.ts` should remain the minimal Worker composition entrypoint. HTTP application assembly and bounded route groups live under `src/http/`; route modules must receive application dependencies rather than instantiate D1/R2 infrastructure directly.
- `docs/THREAT_MODEL.md` is the authoritative production-readiness threat baseline. Keep current mitigations distinct from planned controls and never convert a planned mitigation into a capability claim before implementation and validation.
- The intended sequence is Production Readiness Foundation I; Operations & Supply-Chain Foundation; Production Identity & Tenant Boundary; Content Ingestion Architecture; an explicitly approved controlled staging vertical slice; then later retention, backup/recovery, and customer-readiness gates. A sequence label does not authorize its implementation.
- Production authentication/SSO/session management, production tenant provisioning, arbitrary customer uploads, malware scanning/quarantine, production Cloudflare resources, retention/legal hold, complete backup/restore, customer data, PHI, PostgreSQL, and paid runtime services remain outside the current repository capability and authorization boundary.
- Continue to preserve existing tenant isolation, membership/role/permission authorization, exact-version/hash approval evidence, immutable template/workflow history, append-only audit evidence, same-origin synthetic mutation controls, and synthetic-session isolation while production boundaries are introduced incrementally.

## Production Readiness Foundation II — Operations & Supply-Chain boundary

Foundation II strengthens engineering and operations controls without adding an end-user product feature or provisioning a production environment.

- `.github/workflows/ci.yml` retains the existing read-only `contents: read` token scope and existing `pull_request`/`main` triggers. Every checkout uses `persist-credentials: false`; validation workflows do not push or use `pull_request_target`.
- Permanent CI Actions are pinned to full upstream SHAs: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7`), `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86` (`v6`), and `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (`v7`). Dependabot's GitHub Actions ecosystem remains enabled for reviewable pin updates.
- CodeQL was evaluated for the public TypeScript repository and deferred in this release because the advanced result-upload workflow normally requires `security-events: write`; Foundation II preserves the no-write PR validation boundary. Any later CodeQL/ruleset change requires separate review.
- `scripts/migration-files.ts` is the shared repository migration loader. It accepts only the contiguous ordered `NNNN_name.sql` history and fails on skipped/reordered/malformed migration plans. E2E setup uses the same loader.
- `tests/unit/migration-upgrade-path.test.ts` proves clean creation through `0011` and the explicitly supported immediately-prior path `0010 -> 0011`, including representative-record survival and continued cross-tenant, append-only-audit, and change-summary invariants.
- `docs/OPERATIONS_RECOVERY.md` is the durable migration/backup/recovery procedure baseline. Released migrations are forward-only immutable history; corrections use a new migration. Production execution requires pre-change state capture/backup, post-change verification, and an explicit recovery direction rather than improvised destructive rollback.
- The existing portable JSON export remains an application portability artifact and **not** a complete production backup. Complete recovery requires coordinated D1 metadata/state, R2 controlled content, schema/migration version, configuration/deployment mapping, audit/evidence integrity, and protected secret/key references without copying secrets into repository artifacts.
- `tests/unit/recovery-drill.test.ts` exercises a deterministic synthetic SQLite reconstruction and verifies selected tenant/workspace, document/template version/hash, workflow, approval, role-binding, schema, and append-only audit relationships. It is not a production D1/R2 disaster-recovery test and establishes no RPO/RTO.
- Customer RPO/RTO, R2 recovery mechanism, backup schedule/retention/encryption/key ownership, recovery authority/break-glass model, complete D1/R2 reconciliation, and production recovery-drill cadence remain unresolved deployment decisions.
- Production authentication/session management, tenant provisioning, customer uploads, malware scanning/quarantine, production Cloudflare resources, retention/legal hold/destructive disposition, customer data, PHI, PostgreSQL, paid security features, analytics/tracking, and paid services remain outside the authorized capability boundary.
- Expected new recurring cost remains `$0`.

## Production Identity & Tenant Boundary I — Authentication Contracts & Session Core boundary

- Preserve the chain: validated external principal -> application-owned identity subject -> active tenant membership -> internal role binding -> required permission -> tenant/workspace/resource scope. Provider identity never directly grants permission.
- `AuthenticatedPrincipal` contains provider, exact issuer, immutable external subject, authentication time, and optional bounded presentation metadata only. Never add raw tokens, passwords, MFA material, credentials, email-domain authority, display-name authority, or unrestricted claims.
- External identity uses the existing `(provider, provider_subject)` uniqueness with canonical JSON `[issuer, immutable subject]` stored as `provider_subject`. Unknown mappings fail closed; no JIT/SCIM/email-domain enrollment or schema migration exists in this slice.
- `SessionService` owns opaque 256-bit IDs, bounded lifetime, expiry, revoke/logout, and rotation through injected ports. `src/local-auth/` adapters are test/local only and must not be imported into normal Worker composition.
- `DatabaseTenantContextResolver` verifies active membership and workspace ownership. Browser tenant/workspace values are selectors only. Permission logic stays in existing authorized application services and `DatabaseAuthorizationPolicy`, preserving live suspension/role-removal behavior.
- `src/http/authentication.ts` is a future-route middleware building block, not a live login system. It accepts the separate `ldw_authenticated_session` cookie, emits one generic authentication failure, and passes normalized internal context. It is not registered in `src/http/app.ts` pending an approved live provider and production session store.
- Keep `/demo`, `ldw_guided_demo_session`, synthetic identities, and `DEMO_MUTATIONS_ENABLED` isolated from production authentication.
- Local/test cookie posture is HttpOnly, Secure on HTTPS, bounded Max-Age, SameSite=Strict, Path=/. Revisit redirect/SameSite/CSRF/logout semantics with the real provider without weakening ordinary same-origin mutation protection.
- Session security events contain only established/revoked/rotated, internal subject ID, and timestamp. No production audit sink is selected and no token/cookie/email claim/MFA/credential payload may be logged.
- Future live identity work still requires provider/protocol assertion validation, registration/redirect ownership, production session storage, provider logout/revocation, MFA/conditional access, provisioning/SCIM/group mapping/deprovisioning, break-glass administration, monitoring/audit sink, and authenticated controlled staging.
- No customer uploads, production Cloudflare resources, production tenant provisioning, retention/legal hold, customer data, PHI, PostgreSQL, analytics/tracking, or paid service is introduced. Expected recurring cost remains `$0`.

## Production Identity & Tenant Boundary II handoff

Repository: `LowcountryDigitalWorks/document-control`

Authorized base: `137bd2658763c12be36dfb385c6c3f4aecdb3c68`

Branch: `release/production-identity-tenant-boundary-2`

Draft PR: `#43 — Production Identity & Tenant Boundary II — OIDC Security & Durable Session Architecture`

### Work completed

- Added Authorization Code OIDC security contracts, short-lived one-time callback transactions,
  state/nonce verifier handling, PKCE S256, bounded return targets, and minimized security-event types.
- Added platform Web Crypto state/nonce/PKCE/digest primitives and provider-bound RS256 ID-token
  validation against trusted configured public JWK material.
- Revised the session boundary so raw browser bearer tokens never reach durable storage; D1 stores
  only domain-separated SHA-256 verifier digests.
- Added `DatabaseSessionStore`, transactional replacement-verifier-bound rotation, immediate
  revocation/expiry denial, and cleanup that is explicitly non-authoritative for validity.
- Added migration `0012_authenticated_session_verifiers.sql` and upgraded migration tests through
  clean `0012` plus `0011 -> 0012`.
- Added ADR `docs/adr/0003-d1-verifier-only-durable-session-state.md`.
- Added bounded OIDC transaction-cookie helpers and updated the production-style authenticated cookie
  to `Path=/app`, `SameSite=Lax`, HttpOnly, bounded lifetime, HTTPS Secure, and matching logout clear.
- Added deterministic/no-network synthetic cryptographic tests and a test-only full authenticated route
  composition through current membership and permission authorization.

### Architectural decisions

- D1/SQLite is the initial authoritative durable session-state store.
- The browser credential is 256-bit opaque random bearer material; the durable lookup key is a
  domain-separated SHA-256 verifier. No password-hashing semantics are added for this high-entropy
  secret.
- D1 transactional batch semantics are required for rotation; KV/cache/index state is not
  authentication truth.
- OIDC provider assertions remain outside application authorization. Claims normalize only to
  `AuthenticatedPrincipal`; current internal membership/role/permission/scope remains authoritative.
- The permanent test validator accepts only RS256 against configured public JWKs and uses Web Crypto;
  no custom signature algorithm or new JWT/OIDC dependency was added.
- Authorization transaction state remains local/in-memory for this non-live release; production
  persistence is a future staging decision.

### Assumptions and boundaries

- No live Microsoft Entra, Google, Okta, Auth0, or other provider is contacted.
- No production app registration, client secret, certificate, signing private key, Cloudflare resource,
  session cleanup schedule, provider discovery/JWKS network client, or live login route is created.
- `/demo` remains synthetic and isolated.
- Existing mutation CSRF/same-origin protections remain authoritative; `SameSite=Lax` for login redirect
  cookies does not replace them.
- Expected new recurring cost is `$0`.

### Unresolved next-stage work

Before controlled authenticated staging, explicitly decide and review:

- actual provider/application registration and ownership;
- discovery/JWKS retrieval, cache/freshness, signing-key rollover, issuer/audience configuration, and
  redirect URI control;
- production authorization-code exchange client and provider credential management if required;
- durable/distributed production authorization-transaction state;
- provider logout, disabled-user/session-revocation behavior, final idle/absolute session policy, and
  cleanup schedule;
- MFA/Conditional Access expectations;
- tenant provisioning, SCIM/JIT/group mapping/deprovisioning;
- break-glass/platform administration;
- production audit/monitoring/SIEM behavior; and
- controlled authenticated staging and recovery validation.

### Recommended next action

The authoritative orchestrator should review PR #43 at its final frozen head and exact normal CI
results. This specialist workstream must not merge it. No production identity-provider configuration
or Cloudflare provisioning should begin solely from this handoff.
