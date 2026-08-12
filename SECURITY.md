# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed secret. Contact
`eddie@lowcountrydigitalworks.com` with a concise description, affected revision, reproduction
steps, and impact. Do not include real customer data, PHI, credentials, tokens, or other secrets.

## Current scope

This repository is pre-production. The synthetic demo, foundational domain invariants, application
authorization, production-readiness architecture, CI supply-chain controls, migration discipline, and
local synthetic recovery assurance are in scope for review.

Production authentication/session management, tenant provisioning, customer uploads, malware
scanning/quarantine, data retention/legal hold, complete production backup/recovery, and production
customer infrastructure are not implemented and must not be inferred from product-shaped synthetic
routes or local recovery tests. Customer data and PHI are prohibited in the current
synthetic/foundation environment.

The engineering threat model is maintained in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). The
operations/migration/recovery baseline is maintained in
[`docs/OPERATIONS_RECOVERY.md`](docs/OPERATIONS_RECOVERY.md). These documents distinguish current
controls, future mitigations, unresolved decisions, and release gates. They are not certification,
audit opinions, compliance determinations, or customer RPO/RTO commitments.

## Required properties

- Tenant-owned data is always scoped by tenant.
- Authentication source does not grant application authority by itself; application authorization
  requires the appropriate membership/role/permission relationship.
- Approval applicability requires the exact document-version ID and SHA-256 hash.
- Workflow instances and evidence remain pinned to exact workflow-definition versions.
- Controlled template provenance and immutable version identity are preserved.
- Audit events are append-only.
- Secrets are supplied at deploy time and never committed to source control, portable exports,
  migration examples, or recovery evidence.
- Public/synthetic demonstrations contain synthetic data only and accept no arbitrary customer file
  uploads.
- Planned security controls are not described as implemented until they are actually enforced and
  validated.

## Repository and CI security

- Protected `main` requires pull-request flow, linear history, resolved review threads, squash-only
  merge, and the `quality`, `browser`, and `secrets` checks.
- Normal CI is read-only at `permissions: contents: read` and does not use `pull_request_target`.
- Every permanent CI checkout sets `persist-credentials: false`.
- Permanent external GitHub Actions are pinned to full official upstream commit SHAs rather than
  floating major tags. Dependabot's GitHub Actions ecosystem remains enabled for reviewable pin
  updates.
- CI does not push commits, tags, releases, or branches.
- History-aware secret scanning, dependency audit, strict TypeScript, linting, unit/invariant tests,
  browser tests, architecture tests, and Worker dry-run build remain active.
- Repository tests fail if the permanent CI workflow returns to floating Action tags, persisted
  checkout credentials, write token permissions, or `pull_request_target`.

CodeQL is technically applicable to the public TypeScript repository, but Foundation II does not add
an advanced CodeQL workflow because normal result upload requires `security-events: write`. Preserving
read-only PR validation is the narrower security posture for this release. Any later CodeQL/default
setup or ruleset decision requires separate review and must not introduce a privileged untrusted-code
path.

## Migration security

- Ordered SQL under `migrations/` is the authoritative D1/SQLite schema history.
- Released migrations are forward-only immutable history. Fixes use a new next-ordered migration.
- The repository migration loader rejects malformed, skipped, or reordered migration sequences.
- Tests exercise clean schema creation and the explicitly supported immediately-prior upgrade path
  using the real migration SQL.
- Production migration must be preceded by approved state capture/backup and recovery readiness, then
  followed by schema/invariant verification and application smoke checks.
- Destructive schema changes require a separately reviewed migration/recovery plan and explicit human
  approval; automatic destructive down-migrations are not required merely for symmetry.

## Backup and recovery security

Portable application JSON, D1 metadata/state recovery, R2 binary/content recovery, and complete
recoverable application state are separate concerns. The existing portable JSON export is not a
complete backup.

Backup data, recovery copies, recovery credentials, deployment credentials, encryption keys, and
restore authority are privileged security boundaries. Future production procedures must use
minimum-scope operator/service identities, protect recovery material, avoid copying secrets into
repository artifacts, validate exact content hashes and evidence after restore, and require explicit
human approval before consequential destructive restore or credential/resource replacement.

The local recovery drill uses synthetic in-memory SQLite only. It does not prove production D1/R2
disaster recovery or establish an RPO/RTO.
