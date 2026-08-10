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
- Synthetic public demo, configurable LDW reference theme, light/dark styles, and no uploads.
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
identity-provider secrets. HTTP routes must use the authorized facade rather than invoking the raw
persistence service directly.

## Repository posture

- GitHub repository visibility: **public by explicit owner decision**.
- Package metadata remains `private: true` only to prevent accidental package-registry publication.
- Bootstrap PR #1 and persisted-workflow PR #7 are merged; `main` is the authoritative foundation.
- No production Cloudflare resources, custom domains, customer data, analytics, paid services, or
  public-upload capability have been introduced.

## Intentionally not implemented

- Production authentication/SSO, session management, or identity-provider integration.
- Production tenant provisioning.
- Customer or arbitrary public document uploads or malware scanning.
- HTTP/UI wiring for the persisted workflow service.
- Rich document authoring, retention automation, legal hold, full-text search, GRC frameworks, or
  AI functions.
- PostgreSQL and SharePoint adapters; the provider boundaries remain the extension points.
- Bundled R2/SharePoint binaries in portable exports.
- Public demo session provisioning, Turnstile, rate limiting, or abuse quotas until a real hosted
  demo is created.

## Decisions pending approval

- Final product name and commercial packaging. `document-control` remains the neutral core/repo
  name; Bear Necessities remains a candidate low-cost/non-subscription deployment offering.
- Production identity provider and role-provisioning/mapping model.
- Malware scanning, allowed content types, and upload limits before customer uploads.
- Record retention, deletion, legal hold, backup, and recovery requirements.
- Production Cloudflare account resources and deployment naming.
- Final LDW brand palette/assets; current theme values remain provisional configuration.
