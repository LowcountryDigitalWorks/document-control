# Status

## Implemented in the bootstrap

- TypeScript Worker and Hono routing skeleton.
- D1/SQLite migration baseline and Drizzle schema.
- D1 `DatabaseProvider` and R2 `ContentStore` adapters.
- Generic tenant, workspace, role, document/version, template, workflow, review, approval, and
  audit models.
- Exact-version/hash approval invariant with unit coverage.
- Append-only audit database triggers.
- Versioned application-data export with round-trip coverage.
- Synthetic public demo, configurable LDW reference theme, light/dark styles, and no uploads.
- Formatting, linting, type checking, unit, Playwright, axe, responsive, dependency, secret, and
  Worker build checks.

## Intentionally not implemented

- Production deployment or custom domain.
- Real authentication, tenant provisioning, or authorization middleware.
- Customer or arbitrary public document uploads.
- Rich document authoring, retention automation, search, GRC frameworks, or AI functions.
- PostgreSQL and SharePoint adapters; only their provider boundaries are established.
- R2 binary packaging in exports.

## Decisions pending approval

- Product name and commercial packaging.
- Production identity provider and role-provisioning model.
- Malware scanning and permitted content types before uploads.
- Record retention, deletion, legal hold, backup, and recovery requirements.
- Production Cloudflare account resources and deployment naming.
