# Status

## Implemented in the bootstrap

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

## Repository posture

- GitHub repository visibility: **public by explicit owner decision**.
- Package metadata remains `private: true` only to prevent accidental package-registry publication.
- No production Cloudflare resources, custom domains, customer data, analytics, paid services, or
  public-upload capability are introduced by the bootstrap PR.

## Intentionally not implemented

- Production authentication/SSO or authorization middleware.
- Production tenant provisioning.
- Customer or arbitrary public document uploads or malware scanning.
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
