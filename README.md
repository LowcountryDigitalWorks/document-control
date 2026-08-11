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
- tenant presentation settings, provider-neutral tenant member lifecycle, workspace Roles & Access, and tenant-owned custom workspace roles;
- immutable Workflow Definition creation/versioning;
- workspace Workflow Selection with exact default-version assignment;
- controlled Template Lifecycle administration; and
- controlled Workflow Definition lifecycle administration.

### Identity and authorization

Authentication source and application authorization are deliberately separate.

A small customer can use directly provisioned/app-managed tenant membership plus built-in or custom
application roles without an enterprise directory. A future enterprise deployment can authenticate or
provision identities through Microsoft Entra ID, an Active Directory-connected identity service,
OIDC, SAML, or another approved provider, then map those identities/groups into the same internal
memberships and role definitions.

The application schema already recognizes `local`, `oidc`, `saml`, `entra`, and `external` identity
providers. Provider identity describes **where an identity came from**; it does not grant application
permissions by itself.

The tenant member administration surface uses the existing membership states as **Staged / Active /
Suspended**. The stored Staged value remains `invited`, but this slice does not send invitation email.
Directly provisioned members use the `local` provider marker without storing passwords or other
credentials. Suspending any member makes the existing active-membership authorization check fail while
preserving role bindings and audit/history references.

Tenant-owned custom workspace roles can combine the bounded operational permissions exposed by the
application. They intentionally cannot grant wildcard `*`, `tenant.manage`, `workspace.manage`, or
`role.manage`. Built-in administrator roles therefore remain the authority for access administration.
Creating or editing a tenant-owned custom role requires both tenant-level `tenant.manage` and current
workspace `role.manage`; assigning an existing eligible workspace role remains a `role.manage`
operation.

See [Identity and authorization boundary](docs/IDENTITY_AUTHORIZATION_BOUNDARY.md) for the future
provider/group-mapping contract and security requirements.

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
- Identity/provider integration is separate from application-owned membership, role bindings, and
  permission evaluation.
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

Production authentication/SSO, invitation delivery, external identity provisioning/directory/group synchronization, customer uploads, production
Cloudflare D1/R2 provisioning, public interactive-demo hardening, malware scanning, retention/legal
hold, backup of external binary content, and paid services remain deliberately out of scope until
separately designed and approved.

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
- `docs/` — architecture, ADRs, status, contracts, identity/authorization boundary, and continuation
  notes.

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
- [Identity and authorization boundary](docs/IDENTITY_AUTHORIZATION_BOUNDARY.md)
- [Export contract](docs/contracts/export-v1.md)
- [ADR 0001: Cloudflare-first modular monolith](docs/adr/0001-cloudflare-first-modular-monolith.md)
- [Security policy](SECURITY.md)
