# Document Control

Clean-room, tenant-aware document-control application foundation owned by Lowcountry Digital Works.
The product name is intentionally provisional; `document-control` is the neutral repository and core
name. The GitHub repository is intentionally public. Package metadata remains `private: true` only to
prevent accidental publication to a package registry.

## Current capability

The repository contains a TypeScript/Hono Cloudflare Worker modular monolith with executable
D1/SQLite migrations, application authorization, versioned document-control evidence, and a
synthetic/test-only server-rendered product surface.

Implemented synthetic/test-only product capabilities include:

- tenant/workspace-aware documents and immutable versions with bounded change summaries;
- provider-neutral identity subjects, memberships, roles, scoped permissions, and authorization;
- controlled template lifecycle, exact immutable version provenance, and read-only template evidence;
- versioned workflow definitions, workspace workflow selection, review evidence, and exact approvals;
- exact-version/hash stale-work rejection across workflow, review, and approval behavior;
- workspace Overview, Documents, Templates, Reviews & Approvals, Audit Log, and administration;
- bounded metadata search/filtering, bounded CSV audit evidence, and per-document JSON evidence;
- versioned Backup & Portability export of application state and external content references;
- tenant presentation settings, member lifecycle, Roles & Access, custom workspace roles, workflow
  definition authoring/lifecycle, and controlled non-destructive document retirement; and
- formatting, linting, strict TypeScript, migration/invariant and upgrade-path tests, Playwright, axe
  accessibility, responsive checks, dependency audit, history-aware secret detection, Worker build
  validation, and CI supply-chain regression checks.

The repository has moved from synthetic feature breadth into explicit production-readiness gates.
Production Readiness Foundation I established the threat/architecture boundaries; Production
Readiness Foundation II establishes the repository operations, migration, supply-chain, and recovery
engineering baseline. Neither foundation creates a production customer deployment.

## Production-readiness posture

Document Control is **not** currently a production customer deployment. The current repository does
not implement or authorize:

- production authentication, SSO, or production session management;
- production tenant provisioning;
- arbitrary/customer file uploads;
- malware scanning or quarantine;
- production D1/R2/Worker/customer resources;
- retention/legal hold or destructive production disposition;
- complete production backup/restore or disaster recovery;
- customer data or PHI; or
- paid runtime services, analytics, or tracking.

The formal security boundary is documented in [the threat model](docs/THREAT_MODEL.md). Operational,
migration, backup, and recovery rules are documented in
[Operations, Migration, Backup, and Recovery](docs/OPERATIONS_RECOVERY.md). These engineering
documents distinguish implemented controls from future requirements and are not compliance
certifications or customer RPO/RTO commitments.

### Recommended sequence

The approved high-level sequence is:

1. **Production Readiness Foundation I — Threat Model & Architecture Boundaries** — established;
2. **Production Readiness Foundation II — Operations & Supply-Chain** — current foundation;
3. **Production Identity & Tenant Boundary**;
4. **Content Ingestion Architecture**;
5. an **explicitly approved controlled staging vertical slice** with synthetic/non-sensitive content;
   and
6. later retention, complete backup/recovery, and customer-readiness gates.

These names describe dependencies only. They do not authorize future releases, production
infrastructure, customer data, PHI, or paid services.

## Repository and supply-chain security

Normal GitHub Actions validation remains read-only with `permissions: contents: read` and no
`pull_request_target` workflow. Every permanent CI checkout uses `persist-credentials: false`, so the
checkout step does not leave the GitHub token in local Git configuration for later commands.

Permanent third-party Action references in CI are immutable upstream commit pins:

- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7`);
- `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86` (`v6`); and
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (`v7`).

Dependabot's `github-actions` ecosystem remains enabled so pin updates can arrive as reviewable pull
requests. Repository tests guard against returning CI to floating major tags, credential-persisting
checkout, write token permissions, or `pull_request_target`.

CodeQL was evaluated for this public TypeScript repository and deliberately deferred in Foundation II.
It is applicable and available without a new paid subscription, but an advanced result-upload
workflow normally requires `security-events: write`. This release preserves the no-write PR validation
boundary rather than adding a privileged PR workflow solely for another signal. A later CodeQL/default
setup decision or ruleset change requires separate review.

## Identity and authorization

Authentication source and application authorization are deliberately separate.

A small customer may eventually use directly provisioned/app-managed tenant membership plus built-in
or custom application roles without an enterprise directory. A future enterprise deployment may
authenticate or provision identities through Microsoft Entra ID, an Active Directory-connected
identity service, OIDC, SAML, or another approved provider, then map those identities/groups into the
same internal memberships and role definitions.

The schema recognizes `local`, `oidc`, `saml`, `entra`, and `external` identity providers. Provider
identity describes **where an identity came from**; it does not grant application permissions by
itself. Application authority follows:

`identity subject -> active tenant membership -> internal role binding -> application permission`

The current tenant-member administration surface uses **Staged / Active / Suspended** states. Staged
is stored as `invited`, but no invitation email or credential is created. Directly provisioned
members use the `local` provider marker without storing passwords, MFA material, recovery codes, or
tokens. Production authentication, invitation delivery, IdP provisioning, group mapping, JIT/SCIM,
and stale-session behavior remain future decisions.

See [Identity and authorization boundary](docs/IDENTITY_AUTHORIZATION_BOUNDARY.md).

## Architecture and safety boundaries

### Modular monolith and HTTP composition

Hono remains the web framework and the application remains one modular monolith. `src/index.ts` is the
Worker composition entrypoint. `src/http/app.ts` assembles global security middleware and bounded
route groups under `src/http/routes/`; shared synthetic-session, form-reading, and dependency
composition concerns live under `src/http/` rather than in one large entrypoint.

Route modules receive application dependencies and do not instantiate D1/R2 infrastructure adapters.
Architecture regression tests preserve that boundary and keep the domain independent of Hono and
provider adapters.

### Persistence

**D1/SQLite is the accepted initial production persistence architecture for metadata/state.** Domain
and business rules remain provider-independent, but current application persistence is materially
SQL/SQLite coupled because `DatabaseProvider` exposes raw SQL operations and application services
issue SQL directly.

Therefore a different `DatabaseProvider` implementation does not make the current application
PostgreSQL-ready. Future persistence portability should improve incrementally through narrowly scoped
repository/query ports only when a real production capability creates concrete value. No universal
repository abstraction, ORM migration, PostgreSQL adapter, or database rewrite is currently planned.

See [ADR 0002](docs/adr/0002-d1-sqlite-initial-production-persistence.md).

### Schema evolution

Ordered SQL files under `migrations/` are the authoritative executable D1/SQLite schema/evolution
source. Released migrations are forward-only immutable history; corrections require a new ordered
migration rather than editing a released file.

`scripts/migration-files.ts` validates that the repository's migration sequence is contiguous and
deterministic and applies the actual SQL. E2E database setup uses the same loader.
`tests/unit/migration-upgrade-path.test.ts` proves both clean creation through the current schema and
the explicitly supported immediately-prior upgrade path `0010 -> 0011`, including representative
record survival and critical invariant preservation.

Future production migration requires pre-change state capture/backup, recovery readiness, ordered
execution, post-change schema/invariant verification, application smoke checks, and recorded evidence.
See [Operations, Migration, Backup, and Recovery](docs/OPERATIONS_RECOVERY.md).

### Content

R2 is the initial binary-content adapter behind a create-once, SHA-256-verifying `ContentStore`.
Application-owned keys prevent callers from inventing arbitrary object paths. The current R2 adapter
materializes bytes in memory and is **not** an approved production upload pipeline.

Before customer uploads can exist, the Content Ingestion Architecture gate must define allowed file
types, size limits, bounded streaming, signature/type validation, quarantine, malware scanning,
SHA-256 verification, D1/R2 state transitions, partial-failure compensation, orphan reconciliation,
safe retrieval headers, and retention/deletion interaction.

### Document-control invariants

- Tenant-owned relational references are constrained to prevent cross-tenant attachment.
- Workflow definitions are immutable by version; running instances remain bound to the exact version
  they started with.
- Controlled templates preserve exact immutable content identity and provenance by version.
- Approval records bind actor/timestamp to exact document-version ID, SHA-256 hash, workflow instance,
  and workflow-definition version; later versions never inherit prior approval.
- Review/approval action paths reject stale workflow versions at application and database boundaries.
- Audit records are append-only.
- Controlled document retirement is terminal and non-destructive; it is not retention enforcement or
  deletion.
- Portable JSON export is versioned and validated, but it references external binaries and is not a
  complete production backup.
- LDW remains a configurable reference theme rather than a hard-coded tenant identity.

## Backup, recovery, and portability boundary

Four concepts must remain distinct:

1. **Portable application JSON export** — validated application metadata/state plus external content
   references; useful for portability, not a complete backup.
2. **D1 metadata/state recovery** — provider/state-level protection for relational metadata, evidence,
   authorization, audit history, and schema state.
3. **R2 controlled-content recovery** — independent recoverability of the exact binary objects whose
   canonical SHA-256 identities are recorded by application metadata.
4. **Complete recoverable application state** — coordinated D1 + R2 + schema/migration version +
   relevant configuration/deployment mapping + evidence integrity, followed by reconciliation.

D1 and R2 are not one application-atomic transaction, so restore procedures must detect missing
objects, orphan content, hash mismatches, and metadata/content restore-point skew rather than silently
relinking or deleting evidence.

`tests/unit/recovery-drill.test.ts` rebuilds a clean current SQLite schema from real migrations,
restores bounded synthetic relational evidence, and revalidates foreign keys, document/template
hashes, workflow/approval bindings, role binding, schema state, and append-only audit protection. It
is intentionally a **local synthetic assurance drill**, not proof of production D1/R2 disaster
recovery and not an RPO/RTO claim.

Customer RPO/RTO, backup schedule/retention, R2 recovery mechanism, encryption/key ownership,
recovery authority, and full production reconciliation remain deployment decisions.

## Threat model highlights

The production-readiness threat model covers, among other areas:

- cross-tenant IDOR and tenant enumeration;
- privilege escalation, compromised administrators, and stale authorization;
- external IdP confused-deputy and malicious-claim risks;
- session theft/fixation, CSRF, and request replay;
- malicious uploads, metadata/content-type confusion, path handling, and resource exhaustion;
- D1/R2 partial success, races, and orphan reconciliation;
- workflow/approval/evidence/audit tampering;
- export-as-exfiltration;
- retention/deletion and backup/restore failure;
- recovery authorization bypass;
- production secret leakage; and
- CI/deployment compromise.

See [Threat Model](docs/THREAT_MODEL.md) for the existing mitigation, planned mitigation/release gate,
and residual/open decision for each threat.

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
and migration/recovery tests, and a Worker dry-run build. GitHub Actions separately runs `quality`,
`browser`, and `secrets`; all three are required on protected `main`.

## Repository map

- `src/domain/` — framework-independent document, template, approval, workflow, role, lifecycle, and
  audit rules.
- `src/application/` — authorization-aware application services, SQL-oriented persistence port,
  validation, content-store port, and portable export contracts.
- `src/infrastructure/` — Cloudflare D1/R2 adapters and application-owned content-key builders.
- `src/http/` — Hono composition, shared HTTP/session/form concerns, dependency wiring, and bounded
  route groups.
- `scripts/migration-files.ts` — deterministic loader/validator for the authoritative migration SQL.
- `migrations/` — authoritative ordered D1/SQLite schema and integrity invariants.
- `tests/` — executable migration/upgrade/recovery, domain, authorization, portability, architecture,
  supply-chain, security-header, accessibility, browser, and responsive checks.
- `docs/` — architecture, ADRs, threat model, operations/recovery, status, contracts,
  identity/authorization boundary, and continuation notes.

## Deployment boundary

No production deployment is implied by repository development. Before creating or modifying any
production Cloudflare resource, record current state, proposed state, cost, rollback path, and obtain
Eddie's explicit approval. Do not attach customer data, PHI, public uploads, production identity, or a
custom domain merely to exercise the application.

## Documentation

- [Threat Model](docs/THREAT_MODEL.md)
- [Operations, Migration, Backup, and Recovery](docs/OPERATIONS_RECOVERY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [ADR 0001: Cloudflare-first modular monolith](docs/adr/0001-cloudflare-first-modular-monolith.md)
- [ADR 0002: D1/SQLite initial production persistence](docs/adr/0002-d1-sqlite-initial-production-persistence.md)
- [Identity and authorization boundary](docs/IDENTITY_AUTHORIZATION_BOUNDARY.md)
- [Export contract](docs/contracts/export-v1.md)
- [Current status](docs/STATUS.md)
- [Handoff](docs/HANDOFF.md)
- [Clean-room statement](docs/CLEAN_ROOM.md)
- [Security policy](SECURITY.md)
