# Document Control

Clean-room, tenant-aware document-control application foundation owned by Lowcountry Digital Works.
The product name is intentionally provisional; `document-control` is the neutral repository and core
name. The GitHub repository is intentionally public. Package metadata remains `private: true` only to
prevent accidental publication to a package registry.

## Current capability

The repository now contains a TypeScript/Hono Cloudflare Worker modular monolith with executable
D1/SQLite migrations and provider boundaries for metadata and binary content.

Implemented synthetic/test-only product capabilities include:

- tenant/workspace-aware document and immutable version records;
- provider-neutral identity, membership, roles, scoped permissions, and authorization;
- create-from-controlled-template document workflows;
- exact-version workflow instances, review evidence, approvals, and changed-version invalidation;
- workspace overview, Documents, Templates, Reviews, Approvals, Audit Log, and bounded search/filtering;
- Backup & Portability export of persisted application state and external content references;
- tenant presentation settings and workspace Roles & Access administration;
- immutable Workflow Definition creation/versioning;
- workspace Workflow Selection with exact default-version assignment;
- controlled Template Lifecycle administration; and
- controlled Workflow Definition lifecycle administration.

### Workflow Definition lifecycle

The administration UI uses three deliberately distinct operational labels:

- **Active** — may be newly assigned to workspaces and selected as a new default;
- **Legacy** — may continue where already configured, but cannot be newly assigned or newly selected
  as a default; it can be returned to Active; and
- **Retired** — historical-only and cannot be used for new work. A workflow version must be removed
  from every workspace before retirement.

The canonical persisted/exported value behind the **Legacy** label is `deprecated`. That internal
value is retained as an implementation detail; user-facing administration should use **Legacy**.
Running workflow instances, reviews, approvals, and audit evidence remain pinned to the exact
workflow-definition version they originally used regardless of later lifecycle changes.

## Architecture and safety boundaries

- D1/SQLite stores relational application metadata behind a `DatabaseProvider` boundary.
- R2 is the initial binary-content provider behind a create-once, SHA-256-verifying `ContentStore`
  boundary.
- Ordered SQL files under `migrations/` are the authoritative executable schema/evolution source.
- Tenant-owned relational references are constrained to prevent cross-tenant attachment.
- Workflow definitions are immutable by version; workflow instances remain bound to the exact
  definition version they started with.
- Templates are controlled/versioned records with lifecycle and provenance metadata.
- Approval records bind actor and timestamp to an exact document version, SHA-256 content hash,
  workflow instance, and workflow-definition version.
- A later document version never inherits an earlier approval.
- Audit records are append-only.
- Application data has a versioned, validated portable JSON export contract.
- The synthetic demo contains no customer data and accepts no arbitrary file uploads.
- LDW is a configurable reference theme rather than a hard-coded product identity.

Production authentication/SSO, customer uploads, production Cloudflare D1/R2 provisioning, public
interactive-demo hardening, malware scanning, retention/legal hold, backup of external binary
content, and paid services remain deliberately out of scope until separately designed and approved.

## Local development

Requirements: Node.js 22 and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Then open <http://127.0.0.1:8787>. Synthetic interactive routes remain disabled unless the local/test
configuration explicitly enables `DEMO_MUTATIONS_ENABLED=true`.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm secrets:scan
pnpm test:unit
pnpm build
pnpm test:e2e
pnpm audit --audit-level=high
```

`pnpm check` runs formatting, linting, type checking, history-aware secret scanning, unit/invariant
tests, and a Worker dry-run build. GitHub Actions also runs Playwright/axe browser, accessibility,
responsive, dependency-audit, and independent secret-scan jobs.

## Repository map

- `src/domain/` — framework-independent document, template, approval, workflow, role, lifecycle, and
  audit rules.
- `src/application/` — authorization-aware application services, provider ports, validation, and
  portable export contracts.
- `src/infrastructure/` — Cloudflare D1/R2 adapters and application-owned content-key builders.
- `src/ui/` — semantic server-rendered synthetic application/admin surfaces and configurable theme.
- `migrations/` — authoritative ordered D1/SQLite schema and integrity invariants.
- `tests/` — executable migration, domain, authorization, portability, security, accessibility,
  browser, and responsive checks.
- `docs/` — architecture, ADRs, status, contracts, and continuation notes.

## Deployment boundary

No production deployment is implied by repository development. Before creating or modifying any
production Cloudflare resource, record the current state, proposed state, cost, rollback path, and
obtain Eddie's explicit approval. Do not attach customer data, public uploads, production identity,
or a custom domain merely to exercise the synthetic application.

## Documentation

- [Clean-room statement](docs/CLEAN_ROOM.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current status](docs/STATUS.md)
- [Handoff](docs/HANDOFF.md)
- [Export contract](docs/contracts/export-v1.md)
- [ADR 0001: Cloudflare-first modular monolith](docs/adr/0001-cloudflare-first-modular-monolith.md)
- [Security policy](SECURITY.md)
