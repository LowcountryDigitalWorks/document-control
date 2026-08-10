# Document Control

Clean-room, tenant-aware document control foundation owned by Lowcountry Digital Works.
The product name is intentionally provisional; `document-control` is the neutral repository
and core name. “Bear Necessities” may describe a future low-cost deployment tier, but is not
used in domain objects or architecture.

The GitHub repository is intentionally public. The package remains marked `private: true` only
to prevent accidental publication to a package registry.

## What this bootstrap proves

- A Cloudflare Worker serves semantic, server-rendered HTML through Hono.
- D1/SQLite stores application metadata behind a `DatabaseProvider` boundary.
- R2 stores document binaries behind a create-once, hash-verifying `ContentStore` boundary.
- Tenant-owned relational references are constrained so IDs from another tenant cannot be
  silently attached to a record.
- Identity subjects, tenant memberships, configurable role definitions, and scoped role bindings
  are modeled without choosing a production authentication provider yet.
- Versioned workflow definitions contain their own states and transitions; workflow instances
  remain bound to the exact definition version they started with.
- Templates are versioned controlled records with lifecycle and provenance metadata.
- Approval records bind an actor and timestamp to an exact document version, SHA-256 content
  hash, workflow instance, and workflow-definition version.
- A later document version never inherits an earlier approval.
- The public demo uses synthetic data and accepts no arbitrary file uploads.
- Application data has a versioned, structurally validated portable JSON export contract.
- LDW is the reference theme, configured through replaceable theme values and CSS tokens.

## Local development

Requirements: Node.js 22 and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Then open <http://127.0.0.1:8787>. The local Worker uses Wrangler's local D1 and R2
implementations.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e
pnpm audit --audit-level=high
```

`pnpm check` runs formatting, linting, type checking, secret scanning, unit/invariant tests, and a
Worker dry-run build. GitHub Actions adds Playwright/axe desktop and mobile checks plus dependency
audit and a repository/history secret scan.

## Repository map

- `src/domain/` — framework-independent document, template, approval, workflow, role, and audit
  rules.
- `src/application/` — provider ports and portable export contract/validation.
- `src/infrastructure/` — Cloudflare D1/R2 adapters and application-owned content-key builders.
- `src/ui/` — semantic server-rendered demo and configurable theme.
- `migrations/` — authoritative D1/SQLite schema and relational invariants.
- `tests/` — domain, executable migration, content integrity, portability, accessibility, browser,
  and responsive checks.
- `docs/` — architecture, ADRs, status, contracts, and handoff notes.

`migrations/0001_initial.sql` is the authoritative executable schema for the bootstrap. A second
independently maintained ORM schema is intentionally avoided until it can be generated from or
mechanically verified against the migration.

## Deployment setup

1. Review the target LDW Cloudflare account and record the intended resource names and rollback.
2. Create production D1 and R2 resources only after explicit approval.
3. Replace the placeholder D1 database ID in `wrangler.jsonc` and confirm the intended Worker
   name.
4. Apply migrations with `pnpm db:migrate:remote` only after reviewing the target account.
5. Deploy a preview first with `pnpm deploy:preview`.
6. Attach a custom domain only after recording current state, expected effect, and rollback.

No production resources, paid services, analytics, trackers, CMS, AI service, or public upload
facility are created by this pull request.

## Documentation

- [Clean-room statement](docs/CLEAN_ROOM.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current status](docs/STATUS.md)
- [Handoff](docs/HANDOFF.md)
- [Export contract](docs/contracts/export-v1.md)
- [ADR 0001: Cloudflare-first modular monolith](docs/adr/0001-cloudflare-first-modular-monolith.md)
- [Security policy](SECURITY.md)
