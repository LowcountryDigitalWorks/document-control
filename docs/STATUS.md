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

### Versioned per-document evidence manifest export (synthetic/test only)

- `/demo/app/documents/:documentId/evidence.json` downloads a versioned `document-evidence/v1` metadata manifest assembled from the existing authorized document-detail read model.
- Export reuses the same `document.read` plus `audit.read` authorization checks and synthetic-session isolation as the HTML evidence view; it does not add tenant-wide export authority.
- The manifest preserves exact source-template provenance, document version IDs/numbers/hashes, current-version status, workflow-definition IDs/versions/states, review/approval evidence, timestamps, and bounded primitive audit evidence.
- Internal actor/creator subject IDs, tenant ID, content keys, binary objects, nested/raw audit payloads, and unrelated records are deliberately excluded. At most six primitive audit fields per event are included, matching the bounded evidence posture of the UI.
- Downloads use `Cache-Control: no-store` and a fixed safe filename. Retired documents remain exportable because retirement is historical-only rather than deletion.
- Unit/browser coverage verifies exact historical approval semantics across a changed current version, safe field exclusion, bounded audit evidence, response headers, accessibility of the export link, and cross-session denial.
- This slice does **not** add binary bundling, content download, eDiscovery/legal-hold packaging, retention/archive policy, production authentication, customer uploads, Cloudflare resources, external integrations, or paid services.

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

### Queue-native review and approval actions (synthetic/test only)

- Reviewer and Approver queue cards now complete work through the existing authorized `DocumentWorkflowService`; no parallel task or action persistence model is introduced.
- Reviewer actions support **Accept** and **Request changes**. Requesting changes requires a bounded comment; acceptance may include an optional bounded comment. Existing review/audit records preserve the decision and evidence.
- Approver actions require explicit confirmation that approval applies to the exact current version/hash shown by the queue before the existing exact-version approval service runs.
- Queue POSTs retain the opaque synthetic session, server-controlled Reviewer/Approver identities, same-origin enforcement, and existing `document.review` / `document.approve` authorization. Browser-supplied tenant, workspace, actor, document version, hash, and approval identifiers are not trusted inputs.
- `DocumentWorkflowService.recordReview` now rejects a workflow whose bound version is no longer the document's exact current version, matching the existing stale-version approval guard.
- Migration `0010_current_workflow_action_integrity.sql` independently rejects raw review or approval evidence inserts whose workflow/document version is not the document's current version.
- Unit/browser coverage verifies queue-native acceptance, queue-native exact approval, requested-changes comments, stale-review rejection, database stale-evidence rejection, cross-origin denial, accessibility, responsiveness, and existing session isolation.
- This slice does **not** add production authentication, email/task notifications, assignment/delegation, due dates/escalations, customer uploads, production Cloudflare resources, analytics, or paid services.

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

### Workspace Audit evidence CSV export (synthetic/test only)

- `/demo/app/audit/export.csv` downloads the same authorized workspace Audit Log view as CSV, including the currently submitted literal search filter and the existing 100-record newest-first cap.
- Export reuses the server-controlled synthetic Auditor and existing workspace `audit.read` authorization path; it does not introduce a broader export permission or tenant-wide audit scope.
- CSV includes timestamp, event type, entity type/ID, actor display name, and the same bounded primitive evidence summary shown by the read model. Unrestricted raw `payload_json` and actor subject IDs are not exported.
- Every cell is CSV-escaped and spreadsheet-formula prefixes are neutralized before download. Responses use `Cache-Control: no-store` and a fixed safe attachment filename.
- Unit/browser coverage verifies CSV encoding, formula neutralization, filter preservation, response headers, bounded result scope, and invalid-filter rejection while existing Audit Log authorization/session-isolation coverage remains authoritative.
- This slice does **not** add external SIEM integration, audit forwarding, long-term archival, production retention policy, a raw audit API, production authentication, customer data, Cloudflare resources, or paid services.

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
- The original assignment slice kept role definitions read-only. Tenant-owned custom workspace role
  definition administration is added in PR #29 below; built-in system role definitions remain
  immutable.
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
- The UI also shows tenant membership status and eligible workspace role permissions for context.
  Provider-neutral member creation/status administration is implemented separately in PR #30; this
  Roles & Access surface still does not configure an identity provider or assign tenant/platform
  roles.
- Executable SQLite coverage verifies assign/remove/audit behavior, duplicate no-op behavior,
  suspended-member and tenant-role rejection, and the self-role-management removal guard. Browser
  coverage verifies assignment/removal, audit evidence, scope rejection, cross-origin denial,
  accessibility/responsiveness, and independent synthetic-session isolation.
- This original assignment slice does not add production authentication, SSO/group mapping,
  tenant/platform binding administration, production invitation delivery/external provisioning,
  production Cloudflare resources, or paid services. Tenant-owned custom workspace role
  creation/editing is implemented in PR #29 and provider-neutral member lifecycle in PR #30.

### Tenant-owned custom workspace role administration (synthetic/test only)

- `/demo/app/admin/access` now supports tenant-owned custom `workspace` role definitions in the
  existing `role_definitions` table; no parallel ACL, provider-specific role store, or new schema is
  introduced.
- Authentication source remains separate from application authorization. Small deployments can use
  directly provisioned/app-managed members and roles, while future Microsoft Entra ID, Active
  Directory-connected, OIDC, or SAML deployments can map external identities/groups into the same
  internal memberships, role definitions, and bindings.
- The existing identity schema already supports `local`, `oidc`, `saml`, `entra`, and `external`
  subjects. Provider identity describes where a subject came from and does not grant permissions by
  itself.
- Custom workspace roles use a bounded operational permission allow-list. They intentionally cannot
  grant wildcard `*`, `tenant.manage`, `workspace.manage`, or `role.manage`, preventing a custom
  operational role from becoming an access-administration privilege-escalation path.
- Creating or editing a tenant-owned custom role requires tenant-level `tenant.manage` plus
  current-workspace `role.manage`. Assigning an existing eligible workspace role continues to require
  only current-workspace `role.manage`.
- Built-in system role definitions remain immutable. Terminal non-destructive custom-role retirement
  is implemented in PR #31; hard deletion remains deliberately unsupported.
- Before changing a custom role that is currently assigned, the administration surface shows the
  tenant-wide affected subject/workspace assignments and requires acknowledgement. The role change
  then applies consistently anywhere that tenant-owned role is bound.
- Role names and submitted permission values are bounded/validated server-side. Duplicate tenant
  custom-role names are rejected case-insensitively and unsupported/admin permissions are rejected
  again in the application service rather than relying only on the UI.
- Successful definition changes append `role.definition.created` and `role.definition.updated`
  events to the existing append-only audit stream. Existing role-binding audit events remain
  unchanged.
- Backup & Portability already exports role definitions and role bindings, so custom role definitions
  and their assignments remain inside the existing portable application-data contract without a new
  export version.
- Unit coverage verifies dual authorization, safe permission enforcement, duplicate-name rejection,
  tenant-wide assignment impact, acknowledgement, audit evidence, and identity-provider independence
  including an Entra-backed synthetic subject. Browser coverage verifies create -> assign -> impact ->
  update -> audit behavior, unsafe-permission rejection, same-origin protection, accessibility,
  responsiveness, and synthetic-session isolation.
- `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md` records the future provider/group mapping contract,
  immutable external identifier requirements, deprovisioning considerations, break-glass/MFA
  expectations, and the rule that provider credentials/tokens never belong in role definitions or
  portable exports.
- This slice does **not** configure production authentication/SSO, Entra application registration,
  direct Active Directory connectivity, JIT/SCIM synchronization, production invitation delivery or
  external identity provisioning, provider/group mapping, production Cloudflare resources, customer
  data/uploads, or paid services. Provider-neutral direct member lifecycle is added in PR #30.

### Terminal custom workspace role retirement (synthetic/test only)

- PR #31 adds terminal, non-destructive retirement for tenant-owned custom `workspace` roles without
  deleting the role definition or introducing a parallel lifecycle store. Migration
  `0007_custom_role_retirement.sql` adds nullable `retired_at` metadata to `role_definitions`.
- Retirement requires the same dual authority as custom-role definition administration:
  tenant-level `tenant.manage` plus current-workspace `role.manage`. Built-in/system roles and roles
  outside the tenant-owned workspace scope cannot be retired.
- Every tenant assignment to the role must be removed before retirement. The UI shows retirement as
  unavailable while assignments remain; the service returns a bounded conflict and a database trigger
  independently rejects retirement when any binding still references the role.
- Retirement is terminal. Retired definitions remain visible as historical records but cannot be
  edited, reactivated, or selected for new assignment. A database trigger independently rejects new
  role bindings to a retired role.
- Successful retirement appends `role.definition.retired` to the existing append-only audit stream.
  Portable export preserves the role definition and adds optional `retiredAt` metadata without
  changing the export version or storing provider credentials.
- Unit/invariant coverage verifies the zero-assignment requirement, built-in-role protection, terminal
  state, edit/assignment rejection, database trigger enforcement, input validation, and dual
  authorization. Browser coverage verifies create -> assign -> remove -> retire behavior, retired-role
  UI/read-only history, assignment exclusion, audit evidence, same-origin protection, and axe
  accessibility on the synthetic administration surface.
- This slice does **not** hard-delete role definitions/history, configure production authentication or
  identity providers, add Entra/AD/OIDC/SAML/SCIM integration, touch production Cloudflare resources,
  accept customer data/uploads, or add paid services.

### Provider-neutral tenant member lifecycle administration (synthetic/test only)

- `/demo/app/admin/members` provides tenant-wide membership administration over the existing
  `identity_subjects` and `tenant_memberships` tables; no second user directory or authentication
  store is introduced.
- The route uses the server-controlled synthetic Tenant Administrator and requires tenant-level
  `tenant.manage`. Membership administration is deliberately separate from workspace `role.manage`.
- Directly provisioned members are recorded with provider `local`, a server-generated immutable
  provider subject, display name, and email. The slice stores no password, MFA secret, passkey,
  recovery code, access/refresh token, or invitation credential.
- Existing membership values are presented as **Staged / Active / Suspended**. Staged retains the
  stored value `invited` but means pre-provisioned only; no invitation email is sent. New direct
  members may be staged or active.
- Membership transitions support Staged -> Active/Suspended, Active -> Suspended, and Suspended ->
  Active. Direct member deletion and return-to-Staged after activation are intentionally omitted.
- The acting Tenant Administrator cannot suspend their own current membership from this surface.
- The tenant directory shows provider attribution and tenant/workspace role-binding counts. Suspending
  a member does not delete bindings; the existing authorization policy immediately denies access
  because non-active tenant membership fails authorization. Reactivation therefore restores the same
  preserved role relationships.
- Externally sourced identities, including Entra-backed subjects, use the same application membership
  state without mutating the external provider. This preserves the future boundary for Entra ID,
  Active Directory-connected, OIDC, or SAML provisioning/group mapping.
- Direct provisioning normalizes display names/email and rejects a duplicate email already represented
  in the same tenant. IDs, acting identity, tenant, workspace, provider, and audit metadata remain
  server controlled.
- Successful creation appends `tenant.membership.created`; status changes append
  `tenant.membership.status_changed`, including provider, previous/new status, and preserved role
  binding counts, to the existing append-only audit stream.
- Unit coverage verifies staged/local creation, activation, duplicate email rejection, self-suspension
  protection, tenant-management authorization, Entra-backed suspension, preserved role bindings, and
  immediate authorization denial after suspension. Browser coverage verifies staged -> active -> role
  assignment -> suspended behavior, preserved binding display, active-member eligibility changes,
  audit evidence, same-origin protection, accessibility/responsiveness, and independent synthetic
  session isolation.
- This slice does **not** implement production passwords/login, invitation email delivery, Entra app
  registration, Active Directory connectivity, OIDC/SAML configuration, JIT/SCIM provisioning,
  directory/group synchronization, member deletion, production Cloudflare resources, customer
  data/uploads, analytics, or paid services.

### Authorized tenant Workflow Definition administration (synthetic/test only)

- `/demo/app/admin/workflows` provides a tenant workflow-definition catalog over the existing
  versioned `workflow_definitions` model; no parallel workflow store is introduced.
- Because workflow definitions are tenant-wide, the synthetic Tenant Administrator must satisfy both
  `tenant.manage` at tenant scope and `workflow.manage` for the current workspace before catalog reads
  or definition/version creation executes. A workspace-only workflow grant is not treated as authority
  to rewrite the tenant-wide catalog by itself.
- Migration `0003_workflow_definition_immutability.sql` makes every persisted workflow-definition
  version database-immutable: direct `UPDATE` and `DELETE` attempts abort. Configuration changes are
  represented by inserting a new immutable version instead of mutating historical rows.
- A new workflow family starts at version 1. A later version keeps the same definition ID and receives
  the next positive version number; each workflow instance continues to reference the exact
  definition ID/version it originally started with.
- Workflow names are required and bounded. State identifiers are unique, bounded, lowercase
  identifiers; definitions may contain at most 20 states. Transitions use `from_state -> to_state`,
  reference defined states only, reject duplicates, and are capped at 50 per definition.
- The catalog groups history by stable definition ID and orders versions newest-first within each
  family, so renaming a later version cannot make an older version appear to be the current/latest
  revision.
- Successful creation emits `workflow.definition.created`; later immutable versions emit
  `workflow.definition.version_created` into the existing append-only audit stream. Existing Backup &
  Portability export includes all workflow definition versions and bound instances.
- Creating a newer definition version does **not** automatically select it for documents, migrate a
  running workflow, rebind an existing instance, or alter approval history. Browser coverage proves a
  newly created v2 of the seeded workflow still leaves a subsequently started guided workflow bound to
  the explicitly selected seeded v1.
- The SQLite-backed browser harness applies the immutability migration, and executable tests cover
  v1/v2 creation, direct update/delete rejection, tenant/version lookup, dual authorization,
  malformed/cross-origin requests, audit evidence, accessibility/responsiveness, and independent
  synthetic-session isolation.
- This slice does not add workflow retirement/deprecation semantics, automatic migration/activation,
  graphical workflow authoring, production authentication, production Cloudflare resources,
  customer data, or paid services.

### Authorized workspace Workflow Selection administration (synthetic/test only)

- `/demo/app/admin/workflow-selection` configures which exact immutable workflow-definition versions
  are applicable to the current workspace and which applicable version is the default for future
  workflow starts; it does not introduce a second workflow-definition store.
- The synthetic route uses the server-controlled Tenant Administrator and requires `workflow.manage`
  at the current workspace before reading or changing selection policy. A dedicated authorization
  test verifies denial occurs before persistence when that permission is absent.
- Migration `0005_workspace_workflow_selection.sql` stores tenant/workspace/definition/version
  applicability, enforces referential tenant boundaries, protects assignment identity fields from
  rewrite, and permits at most one database-enforced default workflow version per workspace.
- A workflow version must be applicable before it can become the default. The current default cannot
  be removed from applicability until another applicable version has been selected as default.
- Selection changes affect only future workflow starts. Existing workflow instances, reviews,
  approvals, and audit evidence remain bound to the exact workflow-definition version they started
  with; changing the workspace default never migrates or rewrites historical state.
- The guided synthetic workflow now resolves the workspace default at workflow-start time instead of
  hardcoding seeded v1. The seeded v1 remains the initial workspace default until an administrator
  explicitly changes the selection.
- Successful changes append `workflow.workspace_applicability.enabled`,
  `workflow.workspace_applicability.disabled`, and `workflow.workspace_default.changed` events to
  the existing immutable audit stream; duplicate/no-op requests do not fabricate change evidence.
- Backup & Portability exports now include exact workspace workflow assignments/defaults. The field is
  additive and optional in export v1, so legacy v1 packages without workspace workflow assignments
  remain accepted while present assignments are validated against tenant/workspace/definition and
  actor boundaries.
- SQLite and browser coverage verifies exact-version selection, one-default enforcement,
  cross-tenant rejection, default-removal protection, future-start default resolution, historical
  version pinning, same-origin mutation protection, accessibility/responsive behavior, audit
  evidence, and independent synthetic-session isolation.
- This slice does **not** add workflow retirement/deprecation, automatic migration of running
  workflows, graphical workflow authoring, production authentication, production Cloudflare
  resources, customer data/uploads, or paid services.

### Controlled Workflow Definition lifecycle administration (synthetic/test only)

- Exact immutable workflow-definition versions use the user-facing lifecycle labels **Active**,
  **Legacy**, and **Retired**; lifecycle changes never rewrite definition content. The canonical
  persisted/exported machine value behind **Legacy** remains `deprecated`.
- New versions begin Active. Active versions may be newly assigned to a workspace and selected as a
  new workspace default.
- Legacy versions may remain where already configured, including as an existing default so
  administrators can migrate deliberately, but cannot be newly assigned or newly selected as a
  default. Legacy versions can be returned to Active.
- Retirement is terminal and requires the exact version to be removed from every workspace first.
  Running workflow instances, reviews, approvals, and audit history remain pinned to their original
  exact definition version after retirement.
- Migration `0006_workflow_definition_lifecycle.sql` enforces legal transitions, blocks new
  assignment/default promotion for non-Active versions, and prevents retirement while assignments
  remain.
- Lifecycle administration uses `tenant.manage` plus current-workspace `workflow.manage`; successful
  changes append `workflow.definition.lifecycle_transitioned` to the immutable audit stream.
- Backup & Portability exports include lifecycle state and transition metadata. Legacy v1 exports
  without the additive lifecycle field remain accepted for compatibility.
- This slice does not delete workflow history, migrate running instances, rewrite approvals, add
  production authentication, create production Cloudflare resources, accept customer data/uploads,
  or add paid services.

### Authorized controlled Template Lifecycle administration (synthetic/test only)

- `/demo/app/admin/templates` manages lifecycle state for existing controlled template versions in the
  current workspace; it reuses `templates` and `template_versions` rather than introducing a second
  template catalog.
- The route uses a server-controlled synthetic Template Manager and requires `template.manage` at the
  current workspace before catalog reads or lifecycle mutations execute.
- Migration `0004_template_version_lifecycle_integrity.sql` makes template-version content identity and
  provenance database-immutable: version/template IDs, version number, SHA-256, content provider/key,
  creator, provenance, and creation timestamp cannot be rewritten, and historical template versions
  cannot be deleted.
- The database also enforces the documented lifecycle transition graph and requires publish/supersede
  timestamps to be created only by the corresponding legitimate transition.
- Lifecycle mutations call the existing domain transition logic and update only lifecycle state plus
  publish/supersede timestamps; they do not replace content, change a content reference, or fabricate a
  new template version.
- The workspace catalog displays template/version identity, current-revision marker, lifecycle state,
  SHA-256, provider/key reference, provenance, creator, exact source-document count, and only the
  transitions currently allowed from that version's state.
- Successful transitions append `template.version.lifecycle_transitioned` to the existing immutable
  audit stream with template ID, version number, old/new state, and exact content hash.
- Documents already created from a template version keep their stored source template ID, version, and
  hash even after that template version is superseded or retired. Historical template lifecycle
  changes therefore do not silently rewrite document provenance.
- Retired/superseded versions remain historical evidence. The existing create-from-template service
  continues to allow new documents only from approved or published template versions.
- Administration POSTs require the validated synthetic session, fixed expected fields, bounded input
  validation, and same-origin enforcement. Independent synthetic sessions retain isolated template
  lifecycle state.
- Executable SQLite and browser coverage verify lifecycle transitions, publish/supersede timestamps,
  direct content-identity mutation rejection, deletion rejection, invalid lifecycle-jump rejection,
  audit evidence, exact document-provenance preservation, retired-template creation rejection,
  accessibility/responsiveness, cross-origin denial, and session isolation.
- This slice does **not** add template binary/content uploads, new-template creation, new content-version
  authoring, malware scanning, storage orchestration, production authentication, production Cloudflare
  resources, customer data, or paid services.

### Linear template revision authoring (synthetic/test only)

- Template Managers can create a new sequential immutable Draft revision from any exact historical
  template version when intentionally reusing the exact same content identity.
- The new revision copies the source SHA-256, provider, and content key unchanged; bounded provenance
  and `template.version.created` audit evidence record the exact source version/hash and revision note.
- Only one Draft/Review revision may be open per template family. Migration
  `0009_template_revision_linearity.sql` independently enforces sequential versions, the single-open
  rule, and prevents `templates.current_version` rollback or clearing.
- The synthetic administration flow requires explicit confirmation that no binary/content change is
  being represented, remains same-origin/session protected, and does not accept file bytes.
- Unit/browser coverage verifies exact historical cloning, unchanged content identity, audit evidence,
  current-revision advancement, open-revision blocking, raw-SQL sequence/rollback guards, input
  validation, cross-origin denial, accessibility, responsive behavior, and synthetic-session isolation.
- This slice does **not** implement template binary editing/replacement, file upload, malware scanning,
  storage orchestration, production identity/Cloudflare resources, customer data, or paid services.

### Controlled document retirement (synthetic/test only)

- Approved documents with exact current-version approval evidence can be terminally retired through
  the synthetic document evidence surface. Retirement changes operational state only; no document,
  version, approval, workflow, review, provenance, audit, or content-reference evidence is deleted.
- A dedicated `document.retire` workspace permission is granted by default to Tenant Administrator,
  Workspace Administrator, and Document Owner and is available to bounded tenant custom workspace roles.
- Service guards reject new versions and workflow/review/approval activity for retired documents.
  Migration `0008_controlled_document_retirement.sql` independently blocks invalid retirement,
  reactivation, new versions, new workflows, workflow mutation, reviews, and approvals at the database boundary.
- Successful retirement appends `document.retired` to the existing immutable audit stream with the exact
  current version/hash and approval evidence used to justify disposition. Existing portable export already
  carries document status plus all preserved evidence, so no export-version change is required.
- The browser flow requires explicit confirmation, remains same-origin/session protected, and keeps retired
  records readable as historical evidence. Unit and browser coverage verify approval requirements, terminal
  state, service/database mutation guards, role grants, audit evidence, accessibility, and responsive behavior.
- This slice does **not** delete content, implement retention/legal hold, add storage cleanup, accept uploads,
  configure production identity or Cloudflare resources, or add paid services.

### Workflow authoring improvements (synthetic/test only)

- Workflow Definition administration can use any exact existing definition version as the starting
  point for a new editable draft. Selecting a source only prefills the authoring form; the source
  definition/version remains immutable and saving continues to insert the next version in that family.
- Both new-family and next-version forms support a server-side **Analyze draft** action that performs
  no persistence and reports the initial state, reachable-state count, terminal states, branching
  states, and whether the directed graph contains a cycle.
- Newly submitted workflow drafts now reject states that cannot be reached from the first/initial
  state. This is an authoring-time safeguard only; historical workflow-definition versions are not
  rewritten or retroactively revalidated under the new rule.
- Source selection is tenant-catalog bounded and exact-version validated. The browser cannot use the
  authoring query or analysis action to cross tenant/workspace authorization boundaries.
- Analysis and authoring POSTs retain the existing same-origin and synthetic-session protections.
  Successful creation/versioning continues to use the existing dual `tenant.manage` plus
  current-workspace `workflow.manage` authorization and existing append-only audit events.
- Unit coverage verifies graph reachability, terminal/branch/cycle analysis, source-query validation,
  and authoring mode validation. Browser coverage verifies exact-version prefill, analyze-without-save,
  immutable next-version creation, unreachable-state rejection, same-origin protection, and axe
  accessibility.
- This slice does **not** add drag-and-drop/graphical authoring, conditional expressions, timers,
  scripting, automatic migration of running instances, production authentication, customer uploads,
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
  tenant presentation administration PR #16, workspace Roles & Access administration PR #17,
  immutable Workflow Definition administration PR #18, controlled Template Lifecycle administration
  PR #19, Template Lifecycle integration reconciliation PR #20, workspace Workflow Selection
  administration PR #21, controlled Workflow Definition lifecycle administration PR #27,
  provider-neutral custom workspace roles PR #29, provider-neutral tenant member lifecycle PR #30,
  terminal custom role retirement PR #31, workflow authoring improvements PR #32, controlled
  document retirement PR #33, linear template revision authoring PR #34, bounded workspace audit CSV export PR #35, and versioned per-document evidence manifest export PR #36.
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
- Built-in/system role-definition editing; tenant/platform role assignment administration;
  custom-role hard deletion; member deletion; production invitation delivery; external identity
  provisioning; or identity-provider/group mapping/synchronization.
- Drag-and-drop/graphical workflow authoring, conditional expressions, timers, scripting, or automatic migration beyond the current immutable versioning, exact-version draft cloning/analysis, workspace selection, and controlled lifecycle.
- Template binary/content replacement or upload, new-template-family upload creation, or storage/scanning
  orchestration.
- Logo/favicon upload or external branding-asset URL management.
- Rich document authoring, retention automation, legal hold, destructive document deletion, GRC frameworks, or AI functions.
- PostgreSQL and SharePoint adapters; the provider boundaries remain the extension points.
- Bundled R2/SharePoint binaries in portable exports or external archival/eDiscovery evidence packages.
- Production backup scheduling, restore orchestration, disaster recovery, or retention automation.
- External audit/SIEM integration or archival, unrestricted raw audit-payload export, or production log-retention policy.

## Decisions pending approval

- Final product name and commercial packaging. `document-control` remains the neutral core/repo
  name; Bear Necessities remains a candidate low-cost/non-subscription deployment offering.
- Production identity provider and role-provisioning/mapping model.
- Malware scanning, allowed content types, and upload limits before customer uploads.
- Record retention, deletion, legal hold, backup, recovery, and audit-retention requirements.
- Production Cloudflare account resources and deployment naming.
- Final LDW brand palette/assets; current theme values remain provisional configuration.
