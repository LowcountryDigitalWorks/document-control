# Operations, Migration, Backup, and Recovery

- Status: Production Readiness Foundation II engineering baseline
- Date: 2026-08-12
- Scope: `LowcountryDigitalWorks/document-control`

## Purpose and assurance boundary

This document is the repository-controlled engineering baseline for CI supply-chain posture,
D1/SQLite schema evolution, future production migration procedure, and backup/recovery design. It
does not create production infrastructure, production backup scheduling, production restore
automation, retention/legal-hold behavior, or a customer disaster-recovery service.

Production authentication, tenant provisioning, customer uploads, malware scanning/quarantine,
production Worker/D1/R2 resources, customer data, PHI, and paid services remain outside Foundation
II. The local recovery drill uses synthetic in-memory SQLite only. It does not prove Cloudflare D1 or
R2 disaster recovery and does not establish a customer RPO or RTO.

## Repository supply-chain posture

The permanent validation workflow is `.github/workflows/ci.yml`.

- Repository token permissions remain `contents: read`.
- Normal triggers remain `pull_request` and pushes to protected `main`.
- Existing CI concurrency/cancellation behavior remains intact.
- Every permanent `actions/checkout` step sets `persist-credentials: false`.
- Validation jobs do not push commits, tags, releases, or branches.
- No `pull_request_target` workflow is introduced.
- Dependency installation remains `pnpm install --frozen-lockfile`.

Permanent CI Actions are pinned to verified official upstream commit SHAs while retaining readable
version comments:

- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` — v7.
- `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86` — v6.
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` — v7.

`.github/dependabot.yml` continues to enable the `github-actions` ecosystem so pin updates remain
maintainable through reviewable Dependabot pull requests. Pin changes still require normal CI and
review before merge.

`tests/unit/github-actions-security.test.ts` mechanically guards immutable Action pins,
`persist-credentials: false`, read-only workflow permissions, absence of `pull_request_target`, and
continued Dependabot GitHub Actions maintenance.

### CodeQL evaluation

CodeQL is applicable to the repository's TypeScript/JavaScript code and is available for public
repositories without purchasing a new GitHub security subscription. An advanced CodeQL workflow,
however, normally needs `security-events: write` to upload analysis results.

Foundation II therefore evaluates and defers CodeQL rather than creating a write-capable PR workflow.
The existing required gates remain formatting, linting, strict TypeScript, unit/invariant tests,
architecture tests, Worker dry-run build, dependency audit, history-aware secret scanning, browser,
mobile, accessibility, and responsive checks. A future CodeQL/default-setup decision or required-check
change requires separate security/governance approval.

## Authoritative migration source

Ordered SQL under `migrations/` is the authoritative executable D1/SQLite schema history. No ORM or
duplicate schema description is introduced.

The current sequence is:

1. `0001_initial.sql`
2. `0002_system_role_permissions.sql`
3. `0003_workflow_definition_immutability.sql`
4. `0004_template_version_lifecycle_integrity.sql`
5. `0005_workspace_workflow_selection.sql`
6. `0006_workflow_definition_lifecycle.sql`
7. `0007_custom_role_retirement.sql`
8. `0008_controlled_document_retirement.sql`
9. `0009_template_revision_linearity.sql`
10. `0010_current_workflow_action_integrity.sql`
11. `0011_document_version_change_summary.sql`

`scripts/migration-files.ts` discovers the real SQL files, requires a contiguous four-digit
`NNNN_name.sql` sequence, and applies them in deterministic lexical/ordinal order. E2E setup uses the
same loader. A skipped, malformed, or reordered migration therefore fails repository validation
instead of silently producing another schema.

## Migration discipline

Released migrations are forward-only immutable history.

- Never edit a migration already released on protected `main` to change production behavior.
- Correct released behavior with a new next-ordered migration.
- Review each migration as SQL and preserve or deliberately evolve documented tenant,
  document/template, workflow, approval, authorization, and audit invariants.
- Identify the exact deployed application and schema state before any production migration.
- Capture current production state/backup and verify recovery prerequisites before executing SQL.
- Verify schema state, critical invariants, and bounded application smoke behavior after execution.
- Stop on failure and follow an explicit recovery direction; do not improvise destructive SQL under
  pressure.
- Require a separately reviewed migration and recovery/rollback plan for destructive schema changes,
  including data-loss analysis and explicit human approval.
- Do not build automatic destructive down-migrations merely for symmetry. Forward remediation or
  restore of a verified pre-change state can be safer for SQLite/D1 failures.

Foundation II performs no production migration.

## Upgrade-path assurance

`tests/unit/migration-upgrade-path.test.ts` exercises the real migration SQL.

It proves that an empty supported database can apply the complete sequence through `0011`; that the
repository rejects skipped or reordered migration plans; and that the immediately prior supported
schema through `0010` can apply `0011` to reach current state.

The prior-schema fixture contains representative identity, tenant, workspace, document-version, and
audit records. After upgrade the tests verify record survival, the `0011` historical change-summary
backfill, cross-tenant relational enforcement, append-only audit behavior, change-summary
immutability, and rejection of new document versions that omit the required bounded summary.

The supported path demonstrated by this release is specifically **schema through `0010` -> schema
through `0011`**, plus clean creation through `0011`. It does not promise indefinite support for every
historical intermediate schema. Each future schema release must state and test its supported upgrade
path.

## Portable export is not a complete backup

Four recovery concepts must remain distinct.

### Portable application JSON

The versioned `ldw.document-control.export` JSON package is a validated application portability
artifact. It includes application metadata/state and external content references. It does not bundle
controlled binary objects, provider-level D1 recovery state, deployment credentials/secrets, or an
independently retained recovery copy. It is therefore not a complete production backup.

### D1 metadata/state recovery

A production deployment needs a recoverable path for relational metadata/state: tenant/workspace
relationships, versions, workflow/evidence records, authorization state, audit history, and exact
schema/migration state.

Cloudflare documents D1 Time Travel as a provider point-in-time recovery capability. Its retention,
plan behavior, commands, and operational assumptions must be reverified against current Cloudflare
documentation and the actual deployment immediately before an LDW production procedure is approved.
Provider recovery capability alone is not a complete LDW application recovery procedure.

### R2 controlled-content recovery

Controlled document/template bytes are a separate recovery component. Foundation II does not select,
provision, schedule, or claim an R2 backup mechanism. Future design must define how exact objects are
recoverable, how copies are protected, how keys/versions map back to application records, and how
restored bytes are checked against canonical SHA-256 evidence.

### Complete recoverable application state

A complete recovery posture requires coordinated protection and restoration of D1 metadata/state, R2
controlled content, schema/migration version, required non-secret application/deployment
configuration, audit/evidence integrity, and references to required secret/key material without
copying the secrets themselves into repository artifacts.

A portable JSON export alone, D1 recovery alone, or an R2 copy alone is incomplete.

## Recovery objectives

Customer/deployment RPO and RTO are future deployment decisions. Foundation II invents neither.

Before customer data is permitted, the operating profile must define and validate the acceptable
data-loss window, acceptable recovery duration, backup retention and account/geographic boundary,
encryption/key ownership, recovery authority and approval model, drill cadence, and required recovery
evidence.

## D1/R2 consistency boundary

D1 and R2 do not form one application-atomic cross-service transaction. Backup/recovery must assume
that restored copies can represent different logical points in time.

Recovery must detect and classify metadata that references missing content; content with no matching
metadata; a binary whose SHA-256 does not match application evidence; broken document/template
current-version pointers; workflow/review/approval evidence that no longer binds the expected exact
version/hash; and configuration that points to the wrong environment or resource set.

Do not silently delete or relink orphans during recovery. Reconciliation is evidence-sensitive and
may interact with future retention/legal-hold requirements. Consequential remediation requires a
reviewed decision and, in production, recovery/audit evidence.

## Intended future production migration sequence

No production resource is changed by Foundation II. The future conceptual sequence is:

1. Identify the exact deployed application revision and schema/migration state.
2. Confirm the approved release and exact ordered migration set.
3. Capture current production state/backup using the approved deployment-specific mechanism.
4. Verify recovery prerequisites, recovery authority, required credentials, and recovery-copy
   accessibility without exposing credentials.
5. Apply the ordered migration exactly once using the approved production mechanism.
6. Validate schema state, relational/invariant checks, and the expected migration outcome.
7. Run bounded application smoke checks.
8. Record release/migration evidence: revision, migration set, operator/approval, timestamps,
   validation result, and deviations.
9. On failure, stop further rollout and invoke the approved recovery procedure instead of improvising
   more schema changes.

Cloudflare-specific commands, resource identifiers, and restore selections are intentionally not
invented in this pre-production baseline.

## Restore sequencing and verification

Future recovery should preserve this logical order:

1. Confirm incident scope and freeze conflicting deployment/mutation activity where operationally
   possible.
2. Select the approved recovery point and obtain required human authorization for consequential
   actions.
3. Restore or rebuild D1 schema/state using the approved provider/recovery mechanism.
4. Restore or reassociate R2 controlled content using the approved content recovery mechanism.
5. Restore and verify non-secret deployment configuration and resource bindings.
6. Reconcile D1 references against recovered content before normal write traffic resumes.
7. Execute complete recovery verification.
8. Record recovery evidence and explicitly approve return to service.

Post-restore verification must cover tenant/workspace ownership, document/template version chains and
current pointers, SHA-256 identities for recovered binaries, source-template provenance,
workflow-definition ID/version bindings, workflow instances, reviews, exact approvals, append-only
audit history, membership/role authorization state, configuration/resource mapping, and exact
schema/migration version. A passing health endpoint alone is not sufficient recovery verification.

## Local synthetic recovery validation

`tests/unit/recovery-drill.test.ts` provides a deterministic local assurance drill without cloud
resources or customer files.

The test builds a current in-memory SQLite database from the full real migration history; creates
synthetic identity, membership, workspace, role binding, template/version, document/version,
workflow, exact approval, and audit evidence; computes known document/template SHA-256 values;
captures bounded logical rows; rebuilds a fresh current database; restores the synthetic rows in
relationship-safe order; and verifies foreign keys, hashes, workflow/version binding, exact approval,
authorization state, schema presence, and append-only audit protection.

This proves selected application/evidence relationships can be reconstructed into a clean current
SQLite schema. It is not a production D1/R2 restore tool, not a backup format, and not evidence of any
RPO/RTO.

## Failure and recovery scenarios

### Migration SQL fails before completion

Detection comes from the migration error and schema/version validation. Stop rollout and prevent new
code from assuming the target schema. Determine whether the provider left the prior state intact; if
not, prefer the approved verified pre-change restore or a separately reviewed forward correction.
Revalidate exact schema state, foreign keys/invariants, and smoke behavior. Human approval is required
before destructive restore or emergency corrective migration.

### Application code is deployed against an old schema

Detect through runtime/database errors or deployment smoke checks showing required schema objects are
absent. Stop or roll back the application deployment instead of forcing ad-hoc schema writes. Return
to a compatible approved application revision, then execute the approved migration sequence. A
production rollback/roll-forward decision requires an authorized operator.

### Schema migrated but the new application deployment fails

If the target schema succeeded but application deployment fails, keep writes bounded and do not
reverse schema automatically. Prefer rolling application code back when the migrated schema remains
compatible; otherwise follow the pre-approved recovery plan. Validate schema invariants and the
selected application/schema pairing before service resumes.

### D1 is restored without matching R2 content

Reconciliation detects metadata references whose objects are missing. Withhold affected
content-dependent operations and restore/reconcile the corresponding R2 recovery set. Do not fabricate
replacement content. Validate object existence, exact key/version mapping, SHA-256 identity, and
version/provenance relationships before declaring recovery complete.

### An R2 object is missing after metadata restoration

Isolate the affected record and preserve metadata/evidence. Recover the exact object from an approved
content source. If no source exists, handle it as data loss rather than silently deleting the
reference. Any metadata alteration or unrecoverable-data disposition needs explicit approval.

### Binary hash mismatch

Recompute SHA-256 and withhold the mismatched binary. Recover the exact known-good content and
investigate corruption, incorrect restore selection, or unauthorized replacement. Validate the hash,
version, provenance, and approval evidence before accepting replacement content.

### Portable export is corrupted or incomplete

The parser/validator should reject invalid structure, references, tenant boundaries, or evidence. Do
not treat the artifact as a backup. Obtain another validated portability artifact or use the actual
D1/R2 recovery mechanisms, then independently validate any recovered content.

### Deployment configuration is deleted or damaged

Detect differences between actual provider bindings/configuration and the approved deployment record.
Stop consequential changes and do not recreate resources from memory. Reconstruct from the
repository-controlled deployment source of truth plus provider inventory after approval, then verify
resource mapping and smoke behavior.

### Deployment credential is compromised

Revoke or disable the affected credential and suspend the corresponding automation path. Replace it
through the approved secret-management process with minimum scope and investigate unauthorized use.
Verify the old credential is invalid, the replacement scope is correct, and no unauthorized
state/deployment change occurred. Credential replacement and automation return require authorized
human approval.

### Recovery verification fails

Keep the environment out of normal service/write state. Investigate the failed invariant and select a
known-good earlier recovery point or separately reviewed forward remediation. Repeat the entire
verification set and record both the failure and the successful rerun. Return to service requires
explicit approval.

## Backup/recovery security boundary

Backup data, recovery copies, recovery credentials, deployment credentials, encryption keys, and
restore authority are privileged.

Never commit passwords, tokens, private keys, MFA/recovery codes, backup keys, or customer secrets.
Do not embed secrets in portable exports, migration examples, workflow logs, audit payloads, or
recovery evidence. Future service identities must be minimum-scope. Destructive restore, resource
replacement, and credential rotation require explicit authorized human approval. Recovery evidence
should record who/what/when/result without copying secret values.

## Evidence for future production operations

A future approved migration/recovery should retain the approved release and exact revision, pre/post
schema identifiers, migration files applied, backup/recovery point identifier without secret
material, operator/approval identity, timestamps, validation/smoke results, reconciliation findings,
and incident/recovery references when applicable.

## Unresolved deployment decisions

Foundation II intentionally leaves customer RPO/RTO, D1 recovery retention appropriate to the chosen
plan, independent R2 backup/recovery mechanism, backup storage/account isolation, encryption/key
ownership, backup schedule/retention, recovery operator and break-glass/multi-person approval model,
deployment-configuration recovery source, operational monitoring/SIEM, full D1/R2 reconciliation
tooling, production recovery-drill cadence, and future retention/legal-hold interaction unresolved.

Those decisions require explicit architecture/operations review before customer data is allowed.

## Cost and implementation impact

Foundation II provisions no production resource, purchases no security product, adds no runtime
service, and introduces no recurring service cost. Expected new recurring cost is **$0**.
