# Status

## Implemented

### Bootstrap foundation

- TypeScript Worker and Hono routing skeleton.
- Authoritative D1/SQLite migration with tenant-aware composite foreign keys and integrity triggers.
- Provider-neutral identity subjects and tenant memberships without authentication secrets.
- Configurable role definitions and platform/tenant/workspace-scoped role bindings, including the
  initial system-role catalog.
- D1 `DatabaseProvider` and create-once/hash-verifying R2 `ContentStore` adapters.
- Application-owned tenant/workspace/document-or-template/version content-key construction.
- Generic tenant, workspace, document/version, controlled-template, workflow, review, approval,
  configuration, and audit models.
- Controlled template lifecycle and immutable template-version provenance/content identity.
- Versioned workflow definitions whose own states/transitions govern bound workflow instances.
- Exact document-version/hash/workflow-instance approval invariant in both domain logic and SQL.
- Append-only audit database triggers.
- Versioned application-data export with structural, referential, tenant-boundary, template,
  workflow, and approval validation.
- Synthetic static demo, configurable LDW reference theme, light/dark styles, and no uploads.
- Formatting, linting, strict type checking, executable SQLite migration/invariant tests, content
  integrity tests, Playwright, axe, responsive, dependency, history-aware secret, and Worker build
  checks.
- Worker compatibility date refreshed to the current tested bootstrap date (`2026-08-10`).

### Persisted workflow application service

- `DatabaseProvider` supports transactional batches; the D1 adapter executes application state
  changes through D1 batch operations.
- Documents can be created from an approved/published template while preserving exact template
  version, hash, and provenance metadata.
- Workflow instances bind to the document's exact current version and exact workflow-definition
  version.
- Review decisions persist with audit evidence and advance the bound workflow according to its
  versioned definition.
- Approval is recorded atomically with the workflow/document state change and remains bound to the
  exact document version and SHA-256 evidence.
- Creating a changed document version makes the new version current, returns the document to draft,
  and leaves prior approvals applicable only to their original versions.
- A workflow for an older version cannot approve that older version after a newer version becomes
  current.
- Application-owned R2 content keys and canonical SHA-256 hashes are enforced at the service
  boundary.
- Executable SQLite tests cover the complete persisted lifecycle, transactional rollback, arbitrary
  content-key rejection, and stale-version approval rejection.

The persistence service currently records metadata/state and content references. It does **not**
claim a cross-resource transaction between R2 binary creation and D1 metadata changes. Production
upload orchestration, compensation, limits, and scanning remain future work before customer uploads.

### Provider-neutral authorization boundary

- A typed permission vocabulary separates authorization from the future authentication provider.
- Configurable role definitions carry permission grants; built-in roles receive default grants
  through migration `0002_system_role_permissions.sql`.
- `DatabaseAuthorizationPolicy` evaluates platform, tenant, and workspace role bindings and requires
  active tenant membership for tenant/workspace-scoped access.
- Authorization can safely resolve workspace scope from a workspace, document, or workflow instance
  while preserving the requested tenant boundary.
- Platform Administrator uses an explicit wildcard grant; other built-in roles receive least-purpose
  grants for their document-control responsibilities.
- `AuthorizedDocumentWorkflowService` gates every persisted document-workflow operation before the
  underlying persistence service is invoked.
- Tests cover workspace isolation, viewer/author privilege separation, suspended membership denial,
  platform administration, and facade-to-permission mapping.

This authorization layer does not authenticate users and stores no passwords, sessions, tokens, or
identity-provider secrets. HTTP routes must use authorized application facades rather than invoking
raw persistence services directly.

### Guided authorized workflow UI (local/test only)

- An accessible server-rendered guided flow exercises the real D1-compatible persistence and
  authorization layers through:
  `approved template -> document -> review -> approval -> changed version`.
- The UI visibly demonstrates that version 1's approval remains exact historical evidence after
  version 2 becomes current and requires its own approval.
- Interactive routes are disabled unless `DEMO_MUTATIONS_ENABLED=true`; the normal Worker
  configuration does not enable them.
- The browser supplies only the next allowed guided action. Tenant, workspace, identity, role, and
  permission context remain server-controlled synthetic values.
- Each browser context receives an opaque, server-issued UUID in an HttpOnly, SameSite=Strict cookie
  scoped to `/demo`. All synthetic record IDs are derived server-side from that validated session
  identifier so parallel browser sessions do not share tenant/document/workflow state.
- Same-origin POST enforcement protects guided mutations from cross-origin form submission.
- Browser tests use a SQLite-backed D1 test binding and therefore exercise the real
  `D1DatabaseProvider`, authorization policy, and persisted workflow service rather than a fake
  business service.
- Playwright covers desktop/mobile lifecycle behavior, axe accessibility, responsive overflow,
  cross-origin mutation denial, cookie properties, and independent-session state isolation.

The one-hour browser cookie is **not** a production public-demo lifecycle or production login
session. Cookie expiration does not purge synthetic D1 rows. Do not enable the interactive guided
flow on a shared public deployment until server-side session expiration/purge, quotas, rate limiting,
Turnstile/abuse controls, and operational cleanup are implemented and validated.

### Authorized workspace read navigation (synthetic/test only)

- `WorkspaceReadService` provides tenant/workspace-scoped overview, document-list, and template-list
  read models over persisted D1-compatible data.
- Current approval status is computed from the exact current document-version ID and SHA-256 hash;
  historical approvals are not presented as approval of a newer current version.
- `AuthorizedWorkspaceReadService` gates document and template reads with the existing configurable
  permission model before records reach presentation code.
- Server-rendered `/demo/app`, `/demo/app/documents`, and `/demo/app/templates` screens provide
  responsive workspace navigation, overview counts, document status/version evidence, and controlled
  template lifecycle/provenance information.
- The read screens share the opaque `/demo` synthetic namespace with the guided workflow so a user can
  create a synthetic record in the guided path and observe it through ordinary product navigation.
  Tenant, workspace, subject, role, and permission authority remain server-controlled.
- Independent browser sessions remain isolated: a document created in one synthetic session is not
  visible in another session's workspace read screens.
- Browser coverage verifies navigation, persisted read-after-write behavior, accessibility, responsive
  overflow, and cross-session isolation on desktop and mobile.

### Authorized document detail and evidence (synthetic/test only)

- A tenant/document-scoped detail read model exposes source-template provenance, exact version
  history, versioned workflow/review evidence, approvals, and append-only audit events.
- `AuthorizedDocumentDetailReadService` requires both `document.read` and `audit.read` before the
  evidence query executes.
- The synthetic evidence route uses a server-controlled Document Owner identity rather than broadening
  Author permissions merely for demo convenience.
- `/demo/app/documents/:documentId` displays exact current-version approval applicability, source
  template identity/version/hash/provenance, workflow definition/version/state, reviewer and approver
  evidence, and sanitized audit history.
- Authorization denial and document-not-found use the same not-found response so arbitrary IDs from
  another synthetic session/tenant do not reveal record existence.
- Browser coverage proves that version 1 remains historical approved evidence after version 2 becomes
  current and requires a new approval, while independent sessions cannot read one another's detail
  records.

### Reviews and Approvals queues (synthetic/test only)

- `ReviewApprovalQueueReadService` derives work directly from persisted workflow instances; it does
  not introduce a second task/queue persistence model.
- Reviewer work appears only for workflow instances currently in `review`; approval work appears only
  for instances currently in `approval`.
- A queue item is eligible only when the workflow instance is bound to the document's exact current
  version. A workflow for an older version therefore cannot reappear after a changed version becomes
  current.
- Approval work additionally excludes a version that already has exact matching version/hash approval
  evidence.
- Reviewer Queue access requires both `document.read` and `document.review`; Approver Queue access
  requires both `document.read` and `document.approve`. Authorization denial occurs before the queue
  query runs.
- `/demo/app/reviews` always evaluates the server-controlled synthetic Reviewer identity;
  `/demo/app/approvals` always evaluates the server-controlled synthetic Approver identity. The
  browser cannot choose a subject, role, tenant, workspace, or permission context.
- Reviews & Approvals is linked from the ordinary workspace navigation and Overview.
- Browser coverage verifies the lifecycle handoff from empty queue -> Reviewer Queue -> Approver
  Queue -> cleared after exact approval, confirms changed-version stale-work exclusion, checks axe
  accessibility/responsive overflow, and preserves independent-session isolation.

### Authorized workspace search and filtering (synthetic/test only)

- Documents support bounded server-side filtering by literal title substring, document status, and
  exact current-approval state; Templates support literal name substring and current lifecycle state.
- Search/filter queries remain inside the existing tenant/workspace-scoped `document.read` and
  `template.read` authorization boundaries; filtering does not introduce a separate search authority.
- SQL remains parameterized. User-supplied backslash, `%`, and `_` characters are escaped for `LIKE`
  so they are matched literally rather than becoming wildcard operators.
- Search text is trimmed and capped at 100 characters. Unknown status, lifecycle, or approval values
  are rejected with HTTP 400 before database work.
- Result lists have a fixed 100-record cap and fixed server-side ordering. Clients cannot supply SQL
  sort expressions or arbitrary limits.
- Documents and Templates use ordinary GET forms with bookmarkable URLs and no client JavaScript;
  filter values are preserved in the rendered form, and a zero-result filter is distinguished from a
  genuinely empty workspace.
- Current-approval filtering uses the same exact current-version ID and SHA-256 evidence rule as the
  rest of the product; historical approvals do not make a changed current version appear approved.
- No external search service, search index, vector store, or new infrastructure is introduced.
- Unit and browser coverage verify validation, case-insensitive literal matching, wildcard escaping,
  status/lifecycle filters, approval-state transitions, accessibility, responsive layout, and invalid
  filter rejection.

### Authorized Backup & Portability export (synthetic/test only)

- `PortableExportReadService` assembles the current tenant's persisted D1-compatible application
  state into the existing versioned `PortableExportV1` contract and validates the package before
  serialization.
- Export scope is deliberately tenant-wide and requires `export.create` at tenant scope. The
  synthetic route uses a server-controlled Tenant Administrator; a workspace-scoped role binding is
  not treated as authority to export an entire tenant.
- The package includes tenant configuration, identity subjects, memberships, role definitions and
  bindings, workspaces, documents and immutable versions, templates and provenance, workflow
  definitions/instances, reviews, approvals, append-only audit events, and external content
  provider/key references.
- `/demo/app/admin/backup` previews live package counts and the permitted-data profile from persisted
  tenant state.
- `/demo/app/admin/backup/export` returns the validated live tenant package as JSON with
  `Cache-Control: no-store` and a sanitized tenant-derived filename.
- Content binaries are intentionally not bundled yet. R2/SharePoint objects remain external and are
  represented by provider/content-key references; the export must not be described as a complete
  binary backup until bundled-content support is deliberately implemented and validated.
- The original `/demo/export` static fixture remains only as a reference/compatibility artifact; the
  Backup & Portability route exports the current isolated synthetic session's persisted state.
- Browser coverage creates, reviews, approves, and changes a document, downloads the live export,
  parses it through the existing import/validation contract, verifies historical approval/current
  version semantics, and proves separate synthetic sessions cannot export one another's records.
- This slice is not production backup scheduling, disaster recovery, retention, deletion, legal
  hold, restore orchestration, or a claim that external content has been backed up.

### Authorized workspace Audit Log (synthetic/test only)

- `AuditLogReadService` reads the existing append-only `audit_events` table; it does not introduce a
  second activity or logging store.
- Every ledger query requires both the current tenant ID and workspace ID. Results are newest-first
  and capped at 100 records with no client-controlled SQL sort or limit.
- `AuthorizedAuditLogReadService` requires `audit.read` at workspace scope before the ledger query
  runs. The synthetic route uses a server-controlled Auditor role rather than broadening an Author,
  Reviewer, or Approver role for convenience.
- `/demo/app/audit` is linked from ordinary workspace navigation and renders event type, entity
  type/ID, actor display name, timestamp, and at most four primitive payload key/value summaries.
  It does not expose unrestricted raw payload JSON in the list view.
- Audit search is a bounded literal match across event type, entity type, entity ID, and actor display
  name. Search text is trimmed/capped at 100 characters, SQL remains parameterized, and backslash,
  `%`, and `_` are escaped so they do not become wildcard operators.
- The Audit Log is read-only. Append-only database triggers remain authoritative for immutability;
  the UI neither creates nor mutates audit rows.
- Browser coverage generates events through the real document lifecycle, verifies the resulting
  create/workflow/review/approval/change events newest-first, validates bounded filtering and
  wildcard escaping, checks axe accessibility/responsive overflow, and proves separate synthetic
  sessions cannot read one another's workspace audit history.

### Authorized tenant presentation administration (synthetic/test only)

- `/demo/app/admin/settings` provides the first persisted Administration & Configuration surface over
  the existing `tenant_configurations` and `workspaces` tables; it does not introduce a parallel
  settings store.
- The synthetic route always evaluates a server-controlled Tenant Administrator and requires both
  `tenant.manage` at tenant scope and `workspace.manage` for the current workspace before reading or
  changing settings.
- Administrators can change the current workspace name, application/company presentation names,
  primary/secondary/accent colors, and tenant terminology for workspace/document/approval concepts.
  Stable tenant/workspace identifiers and the underlying domain model are not renamed.
- The permitted-data profile is displayed but intentionally read-only. This UI cannot authorize a
  regulated-data posture or silently change a deployment's data-handling boundary.
- User-supplied presentation text is trimmed, length-bounded, and rejects control characters. Brand
  colors must be exactly six-digit hexadecimal values, and persisted theme values are validated again
  before entering server-rendered CSS.
- Supported edits merge into existing branding/terminology objects so unknown future configuration
  keys are preserved rather than silently deleted by the MVP form.
- Successful changes are written transactionally through the existing database abstraction and emit
  `tenant.presentation_settings.updated` into the existing append-only audit stream with the changed
  field names; a no-op update does not create a change event.
- Administration POSTs require the existing validated synthetic session and same-origin request
  enforcement. The browser never selects the subject, tenant, workspace, role, or permission scope.
- Persisted application/company names, colors, and workspace/document/approval terminology are applied
  back to ordinary synthetic tenant screens at runtime, while malformed stored values fall back to
  known-safe defaults.
- Browser coverage verifies persistence, runtime presentation changes, invalid color rejection,
  cross-origin mutation denial, accessibility/responsive behavior, audit evidence, and independent
  synthetic-session isolation.
- This slice deliberately does not accept logo/favicon uploads or external branding URLs and does not
  add production authentication, tenant provisioning, role-definition/workflow/template mutation UI,
  production Cloudflare resources, customer data, analytics, or paid services.

### Authorized workspace Roles & Access administration (synthetic/test only)

- `/demo/app/admin/access` manages workspace-scoped role assignments over the existing
  `tenant_memberships`, `role_definitions`, and `role_bindings` tables; no parallel ACL or access store
  is introduced.
- The synthetic route uses the server-controlled Tenant Administrator and requires `role.manage` at
  the current workspace before the member/role/binding read model or any mutation is executed.
- Assignment independently verifies that the target subject is an active member of the same tenant,
  that the selected role has `workspace` scope, and that a tenant-defined role belongs to the same
  tenant. Platform- and tenant-scoped roles cannot be assigned from this surface.
- The screen is assignment-only: system and tenant-defined role definitions and their permission
  lists are displayed read-only and are never edited by this slice.
- Duplicate exact workspace assignments are treated as no-ops rather than creating a second binding or
  duplicate audit evidence.
- Removal is constrained to an existing binding in the current tenant/workspace. As a conservative
  self-lockout safeguard, an acting administrator cannot remove their own workspace binding when that
  role grants `role.manage` or wildcard authority.
- Successful changes use the existing transactional database abstraction and append
  `role.binding.created` / `role.binding.removed` events to the existing immutable audit stream with
  the subject, role-definition ID, and role key. Existing Backup & Portability export includes the
  resulting role bindings automatically.
- Administration POSTs require the validated synthetic session, fixed expected form fields, bounded
  identifier validation, and same-origin enforcement. The browser cannot select the acting subject,
  tenant, workspace, or authorization scope.
- The UI also shows tenant membership status and eligible workspace role permissions for context, but
  does not invite/create members, change membership state, configure an identity provider, or assign
  tenant/platform roles.
- Executable SQLite coverage verifies assign/remove/audit behavior, duplicate no-op behavior,
  suspended-member and tenant-role rejection, and the self-role-management removal guard. Browser
  coverage verifies assignment/removal, audit evidence, scope rejection, cross-origin denial,
  accessibility/responsiveness, and independent synthetic-session isolation.
- This slice does not add production authentication, SSO/group mapping, custom role-definition
  creation/editing, tenant/platform binding administration, member invitations/provisioning,
  production Cloudflare resources, or paid services.

All app-shaped `/demo` screens remain product-shape proofs, not an authenticated production tenant
application. They remain behind the synthetic/test demo flag and must not be represented as
production authentication or public-demo hardening.

## Repository posture

- GitHub repository visibility: **public by explicit owner decision**.
- Package metadata remains `private: true` only to prevent accidental package-registry publication.
- Milestones include bootstrap PR #1, persisted-workflow PR #7, authorization PR #8, guided-workflow
  UI PR #9, workspace navigation PR #10, document evidence PR #11, Reviews & Approvals PR #12,
  workspace search/filter PR #13, Backup & Portability PR #14, workspace Audit Log PR #15,
  tenant presentation administration PR #16, and workspace Roles & Access administration PR #17.
- `main` is the authoritative integration branch after reviewed/validated pull requests are merged.
- No production Cloudflare resources, custom domains, customer data, analytics, paid services, or
  public-upload capability have been introduced.

## Intentionally not implemented

- Production authentication/SSO, production session management, or identity-provider integration.
- Production tenant provisioning.
- Customer or arbitrary public document uploads or malware scanning.
- Production authenticated tenant application routing; current app-shaped routes are synthetic/test
  only.
- Public interactive demo hardening: durable server-side demo-session registry, automatic purge,
  Turnstile, rate limiting, quotas, and abuse telemetry/controls.
- Full-text/content-body search or an external/indexed search service; current search is bounded
  metadata filtering only.
- Custom/system role-definition creation/editing or permission-authoring UI; tenant/platform role
  assignment administration; member invitations/provisioning; or identity-provider/group mapping.
- Workflow-definition management or controlled-template lifecycle mutation UI.
- Logo/favicon upload or external branding-asset URL management.
- Rich document authoring, retention automation, legal hold, GRC frameworks, or AI functions.
- PostgreSQL and SharePoint adapters; the provider boundaries remain the extension points.
- Bundled R2/SharePoint binaries in portable exports.
- Production backup scheduling, restore orchestration, disaster recovery, or retention automation.
- External audit/SIEM export, long-term audit archival, or production log-retention policy.

## Decisions pending approval

- Final product name and commercial packaging. `document-control` remains the neutral core/repo
  name; Bear Necessities remains a candidate low-cost/non-subscription deployment offering.
- Production identity provider and role-provisioning/mapping model.
- Malware scanning, allowed content types, and upload limits before customer uploads.
- Record retention, deletion, legal hold, backup, recovery, and audit-retention requirements.
- Production Cloudflare account resources and deployment naming.
- Final LDW brand palette/assets; current theme values remain provisional configuration.
