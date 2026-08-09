# Document Control

Clean-room, tenant-aware document control foundation owned by Lowcountry Digital Works.
The product name is intentionally provisional; `document-control` is the neutral repository
and core name. “Bear Necessities” may describe a future low-cost deployment tier, but is not
used in domain objects or architecture.

## What this bootstrap proves

- A Cloudflare Worker serves semantic, server-rendered HTML through Hono.
- D1/SQLite stores application metadata behind a `DatabaseProvider` boundary.
- R2 stores document binaries behind a `ContentStore` boundary.
- Approval records bind an actor and timestamp to an exact document version, SHA-256 content
  hash, and workflow definition/version.
- A later document version never inherits an earlier approval.
- The public demo uses synthetic data and accepts no arbitrary file uploads.
- Application data has a versioned, portable JSON export contract.
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

`pnpm check` runs formatting, linting, type checking, unit tests, and a Worker dry-run build.
GitHub Actions adds Playwright/axe browser checks, dependency audit, and Gitleaks secret scanning.

## Repository map

- `src/domain/` — framework-independent document, approval, workflow, and audit rules.
- `src/application/` — provider ports and portable export contract.
- `src/infrastructure/` — Cloudflare D1 and R2 adapters plus Drizzle schema.
- `src/ui/` — semantic server-rendered demo and configurable theme.
- `migrations/` — D1/SQLite schema baseline.
- `tests/` — domain, portability, accessibility, browser, and responsive checks.
- `docs/` — architecture, ADRs, status, contracts, and handoff notes.

## Deployment setup

1. Create production D1 and R2 resources in the LDW Cloudflare account.
2. Replace the placeholder D1 database ID in `wrangler.jsonc` and confirm the intended Worker
   name.
3. Apply migrations with `pnpm db:migrate:remote` only after reviewing the target account.
4. Deploy a preview first with `pnpm deploy:preview`.
5. Attach a custom domain only after recording current state, expected effect, and rollback.

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
