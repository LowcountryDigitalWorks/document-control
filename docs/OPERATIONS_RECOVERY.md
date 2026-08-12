# Operations, Migration, Backup, and Recovery

- Status: Production Readiness Foundation II engineering baseline
- Date: 2026-08-12
- Scope: repository-controlled operational design for `LowcountryDigitalWorks/document-control`

## Purpose and assurance boundary

This document defines the repository's current engineering rules for supply-chain validation,
D1/SQLite schema evolution, backup/recovery boundaries, and future production migration/recovery
procedure. It does **not** create production infrastructure, production backups, production restore
automation, customer-data handling, retention/legal-hold behavior, or a disaster-recovery service.

Production authentication, tenant provisioning, arbitrary customer uploads, malware scanning,
production Worker/D1/R2 resources, customer data, PHI, and paid services remain outside this release.

The deterministic tests added with this foundation use local in-memory SQLite and synthetic data. They
prove repository migration order and selected relational/evidence recovery invariants. They do **not**
prove Cloudflare D1 point-in-time recovery, R2 disaster recovery, cross-service consistency under a
real outage, or customer RPO/RTO.

## Repository supply-chain posture

The permanent validation workflow remains `.github/workflows/ci.yml` and keeps repository token
permissions at:

```yaml
permissions:
  contents: read
```

Every normal `actions/checkout` invocation uses `persist-credentials: false`. Validation jobs do not
push commits, tags, releases, or branches, and the workflow does not use `pull_request_target`.

Permanent CI Action references are pinned to full upstream commit SHAs while retaining version comments
for human maintenance:

- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` — `v7`
- `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86` — `v6`
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` — `v7`

`.github/dependabot.yml` continues to enable the `github-actions` ecosystem so pinned upstream
references remain maintainable through reviewable Dependabot pull requests. Pin updates must still
pass the normal required checks before merge.

### CodeQL evaluation

CodeQL is technically applicable to this TypeScript/JavaScript repository and GitHub provides CodeQL
for public repositories without requiring a new paid subscription. The advanced workflow model,
however, normally needs `security-events: write` in order to upload analysis results.

Foundation II deliberately keeps pull-request validation read-only and does not introduce a new
write-capable PR workflow merely to add another signal. CodeQL is therefore **evaluated and deferred**
in this release. A later security/governance decision may consider GitHub default setup or a narrowly
scoped non-PR analysis design, but making CodeQL required or changing the main ruleset requires
separate orchestrator approval.

This decision does not claim CodeQL lacks value; it preserves the release's minimum-token and
no-write-PR boundary while the existing TypeScript, ESLint, unit/invariant, browser, dependency,
secret, and architecture checks remain enforced.

## Authoritative migration source

Ordered SQL files under `migrations/` are the authoritative executable D1/SQLite schema and evolution
history. There is no separately authoritative ORM schema.

The current ordered sequence is:

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

`scripts/migration-files.ts` discovers this real SQL history, validates the four-digit sequence is
contiguous and deterministic, and applies migrations in lexical/ordinal order. Both E2E setup and
upgrade-path tests use that loader. A skipped, malformed, or reordered migration therefore fails the
repository test harness instead of silently producing a different schema.

## Migration discipline

Released migrations are **forward-only immutable history**.

1. Never edit a migration that has been released on protected `main` in order to change production
   behavior.
2. Correct a released schema behavior with a new next-ordered migration.
3. Every new migration must be reviewable as SQL and must preserve or deliberately evolve documented
   tenant, document/template, workflow, approval, authorization, and audit invariants.
4. A production migration must be preceded by an approved release, exact deployed-version/schema
   identification, current-state capture/backup, and verified recovery prerequisites.
5. After execution, verify schema state, critical invariants, and application smoke behavior before
   treating the migration as complete.
6. A failed migration must follow the documented recovery direction; do not improvise destructive SQL
   rollback under pressure.
7. Destructive schema changes require their own reviewed migration and recovery/rollback plan,
   including data-loss analysis and explicit human approval.
8. Do not add automatic destructive down-migrations merely for symmetry. For SQLite/D1 failures,
   forward remediation or restoring a verified pre-change state may be safer than attempting to
   reverse partially applied destructive SQL.

These rules apply to future production operations even though this release performs no production
migration.

## Upgrade-path assurance

`tests/unit/migration-upgrade-path.test.ts` exercises the real SQL files rather than a duplicate schema
description.

The test suite proves:

- an empty supported SQLite database can apply the entire current ordered migration sequence;
- the repository recognizes the exact current migration list and rejects a skipped/reordered plan;
- the immediately prior supported schema state (`0010`) can apply the remaining current migration
  (`0011`);
- representative identity, tenant, workspace, document-version, and audit records survive that
  supported upgrade;
- `0011` backfills the explicit historical change-summary sentinel for pre-feature versions;
- cross-tenant relational enforcement remains active after upgrade;
- append-only audit behavior remains active after upgrade;
- the new change summary remains immutable; and
- post-upgrade document versions cannot omit the required bounded change summary.

The supported path demonstrated by this release is specifically **schema through `0010` -> schema
through `0011`**, plus clean creation through `0011`. This does not claim indefinite support for every
historical intermediate schema. Future releases must explicitly define and test the upgrade path they
support.

## Backup and portability are different concerns

### Portable application JSON export

The versioned `ldw.document-control.export` JSON package is an application portability artifact. It
contains validated application metadata/state and external content references.

It is **not a complete production backup** because it does not bundle the controlled binary objects
stored behind R2/content references, does not capture provider-level D1 recovery state, does not
contain deployment credentials/secrets, and is not a scheduled or independently retained recovery
copy.

### D1 metadata/state backup or point-in-time recovery

A future production deployment needs a recoverable copy or provider-supported recovery path for D1
metadata/state, including tenant/workspace relationships, versions, workflow/evidence records,
authorization state, audit history, and schema/migration state.

Cloudflare currently documents D1 Time Travel as an always-on point-in-time recovery capability for
production D1 storage. Provider retention and behavior depend on the deployed Cloudflare plan and
current provider documentation and must be reverified immediately before a production procedure is
approved. A provider restoration is a **provider capability**, not by itself an LDW application backup
or complete application recovery procedure.

### R2 binary/content backup

Controlled document/template bytes are a separate recovery component from D1 metadata. Foundation II
does not select, provision, schedule, or claim an R2 backup mechanism. A future production recovery
architecture must establish how controlled content is independently recoverable, how recovery copies
are protected, how object versions/keys are mapped, and how restored bytes are checked against the
canonical SHA-256 identities stored in application metadata.

### Complete recoverable application state

A complete recovery posture requires coordinated protection and restoration of, at minimum:

- D1 metadata/state;
- R2 controlled content;
- application configuration that is required to interpret the state;
- exact schema/migration version;
- relevant deployment configuration and resource mapping;
- audit/evidence integrity; and
- references to required secret/key material **without exporting the secrets themselves into the
  repository or ordinary backup manifest**.

A portable JSON export alone, a D1 restore alone, or an R2 content copy alone is therefore incomplete.

## Recovery objectives

Customer/deployment RPO (recovery point objective) and RTO (recovery time objective) are **future
operational decisions**. No RPO/RTO is invented by this engineering foundation.

Before a real deployment, the approved operating profile must state and validate:

- acceptable data-loss window;
- acceptable recovery duration;
- backup/restore retention and geographic/account boundaries;
- recovery-copy encryption and key ownership;
- recovery operator and approval model;
- test cadence; and
- evidence required to demonstrate a successful recovery drill.

## Cross-service consistency boundary

D1 and R2 do not form one application-atomic cross-service transaction. Backup/recovery must therefore
assume that snapshots or restored copies can represent slightly different points in logical time.

The recovery procedure must detect and classify at least:

- D1 metadata that references an R2 object that is missing;
- R2 content that has no corresponding D1 metadata reference;
- an object at the expected key whose SHA-256 does not match application evidence;
- a document/template current-version pointer whose version record is missing or inconsistent;
- workflow/review/approval evidence that no longer binds the expected exact version/hash; and
- restored configuration that points to the wrong environment/resource set.

Do not silently delete or relink an orphan during recovery. Reconciliation is evidence-sensitive and
may interact with future retention/legal-hold requirements. Consequential remediation requires a
reviewed decision and audit evidence in the eventual production procedure.

## Intended production migration sequence

No production migration is performed by Foundation II. The future production runbook sequence is:

1. Identify the exact deployed application revision and schema/migration state.
2. Confirm the approved release and exact ordered migration set to be applied.
3. Capture current production state/backup using the approved deployment-specific mechanism.
4. Verify recovery prerequisites, recovery authority, required credentials, and recovery-copy
   accessibility without exposing credentials in logs or repository artifacts.
5. Apply the ordered migration exactly once using the approved production mechanism.
6. Validate schema state, foreign-key/integrity checks, critical document-control invariants, and the
   expected migration outcome.
7. Run bounded application smoke checks against the migrated environment.
8. Record release/migration evidence: source revision, migration set, operator/approval, timestamps,
   validation result, and any deviations.
9. On failure, stop further rollout and invoke the approved recovery direction rather than improvising
   additional schema changes.

Cloudflare-specific commands, account/resource identifiers, and restore selections must be resolved
from the actual deployment and current provider documentation at execution time. They are deliberately
not invented in this pre-production repository baseline.

## Restore sequencing and post-restore verification

The exact provider steps depend on the future deployment, but application recovery should preserve
this logical ordering:

1. Confirm incident scope and freeze conflicting deployments/mutations where operationally possible.
2. Select the approved recovery point and obtain required human authorization for consequential
   restore actions.
3. Restore or rebuild the D1 schema/state using the approved provider/recovery mechanism.
4. Restore/reassociate R2 controlled content using the approved content recovery mechanism.
5. Restore/verify non-secret deployment configuration and resource bindings.
6. Reconcile D1 metadata references against recovered content before normal write traffic resumes.
7. Execute the verification set below.
8. Record recovery evidence and explicitly approve return to service.

Post-restore validation must cover at least:

- `PRAGMA foreign_key_check` or the production-equivalent relational verification;
- tenant/workspace ownership relationships;
- document and template version chains/current pointers;
- SHA-256 content identity for every binary included in the verified recovery scope;
- source-template provenance and exact version/hash relationships;
- workflow-definition ID/version bindings and workflow-instance state;
- review and exact approval evidence;
- append-only audit history and expected audit coverage;
- active/suspended membership state, role definitions, and role bindings;
- tenant configuration and deployment/resource mapping; and
- the exact schema/migration version expected by the deployed application.

Passing a health endpoint alone is never sufficient recovery verification.

## Local synthetic recovery drill

`tests/unit/recovery-drill.test.ts` provides deterministic local validation without provisioning cloud
resources or using customer files.

The drill:

1. creates an in-memory SQLite database using the full real migration history;
2. creates synthetic identity, membership, workspace, authorization, template/version,
   document/version, workflow, exact approval, and audit evidence;
3. computes known SHA-256 identities from synthetic bytes;
4. captures a bounded logical test state;
5. creates a fresh database and reapplies the full migrations;
6. restores the synthetic relational state in dependency-safe order; and
7. verifies foreign keys, version hashes/change summary, template hash, workflow binding, exact
   approval evidence, role binding, schema presence, and append-only audit protection.

This drill demonstrates that selected application/evidence relationships can be reconstructed into a
clean current SQLite schema. It is **not** a production D1/R2 restore tool, not a backup format, and
not evidence that real Cloudflare disaster recovery meets any RPO/RTO.

## Failure and recovery scenarios

| Scenario | Detection | Containment | Preferred recovery direction | Validation | Human approval |
| --- | --- | --- | --- | --- | --- |
| Migration SQL fails before completion | Migration command/error evidence; schema/version validation does not reach expected state | Stop rollout and prevent new code from assuming the target schema | Determine whether the provider left the prior state intact; otherwise restore the verified pre-change D1 state or apply a separately reviewed forward correction | Exact schema/migration state, foreign keys, invariant tests, smoke checks | Required before destructive restore or emergency corrective migration |
| Application code deployed against old schema | Runtime/database errors or deployment smoke checks show expected columns/triggers absent | Stop/roll back application rollout; do not force ad-hoc schema writes | Return application to the compatible approved revision, then perform the approved migration sequence | Application revision/schema compatibility and smoke checks | Required for production deployment rollback/roll-forward decision |
| Schema migrated but new application deployment fails | Deployment failure while migration evidence shows target schema succeeded | Keep writes bounded; avoid reversing schema automatically | Prefer restoring/rolling back application code if the migrated schema remains backward compatible; otherwise use the approved pre-change recovery plan | Schema invariants plus old/new application compatibility as applicable | Required if state restore or further schema remediation is needed |
| D1 restored without matching R2 content | Reconciliation finds metadata content keys with missing objects | Do not resume content-dependent writes/downloads for affected scope | Restore/reconcile the corresponding R2 recovery set; do not fabricate replacement content | Object existence and canonical SHA-256 match plus document/template chains | Required before declaring affected records recovered |
| R2 object missing after metadata restoration | Logical record resolves to absent object | Isolate affected record/scope and preserve metadata/evidence | Recover exact object from approved content recovery source; if unavailable, treat as data-loss incident rather than silently removing reference | Exact key/version mapping and SHA-256 match | Required for any metadata alteration or unrecoverable-data disposition |
| Binary hash mismatch | Recomputed bytes hash differs from stored canonical SHA-256 | Quarantine/withhold the mismatched object from normal use | Recover the exact known-good binary; investigate whether corruption, wrong restore set, or unauthorized replacement occurred | Recompute SHA-256 and verify provenance/version/approval binding | Required before replacement/remediation is accepted |
| Corrupted or incomplete portable export | Export parser/validation rejects structure, references, tenant boundaries, or evidence | Do not treat the export as a backup or recovery source | Obtain another known-good portability artifact or use the actual D1/R2 recovery mechanisms | `parseExport`/validation plus independent content recovery checks | Required if no validated source remains |
| Deployment configuration deleted or damaged | Resource binding/domain/environment checks differ from approved deployment record | Stop deployment changes and avoid creating replacement resources from memory | Reconstruct from repository-controlled deployment documentation and provider inventory after explicit approval | Resource IDs/bindings, non-secret configuration, application smoke checks | Required before consequential account/resource changes |
| Deployment credential compromised | Provider/GitHub alert, unexpected use, leak evidence, or operator report | Revoke/disable affected credential and suspend its automation path | Issue a replacement with minimum scope through the approved secret-management process; investigate affected actions | Confirm old credential invalid, new scope correct, no unauthorized deployment/state change | Required for credential replacement and return to automated deployment |
| Recovery verification fails | Any required relational/hash/workflow/approval/audit/auth check fails | Keep environment out of normal service/write state | Investigate the failed invariant and select a known-good earlier recovery point or reviewed forward remediation | Repeat the complete verification set; record failure and successful rerun | Required before return to service |

## Security boundaries for backup and recovery

Backup data, recovery copies, recovery credentials, deployment credentials, encryption keys, and
restore authority are privileged security boundaries.

- Never commit credentials, private keys, tokens, recovery codes, or backup encryption keys.
- Do not embed secrets in portable exports, migration examples, workflow logs, audit payloads, or
  recovery evidence.
- Future service identities must be scoped to the minimum resources/actions needed for their role.
- Destructive restore, resource replacement, and credential rotation require explicit authorized human
  approval under the deployment's operating procedure.
- Recovery evidence should record who/what/when/result without copying secret values.
- Recovery copies need an approved access, encryption, retention, and deletion policy before customer
  data is permitted.

## Evidence to retain for future production migrations/recoveries

Repository development does not create these production records yet. A future approved operation
should retain, in an appropriate protected evidence location:

- approved release/PR and exact deployed revision;
- pre/post migration/schema identifiers;
- ordered migration files applied;
- backup/recovery point identifier without secret material;
- operator and required approval identity;
- operation timestamps;
- validation results and smoke-check results;
- reconciliation findings and disposition; and
- incident/recovery references when the operation was failure-driven.

## Unresolved deployment decisions

Foundation II intentionally leaves these decisions open until an actual deployment profile exists:

- customer RPO and RTO;
- D1 recovery retention/operational selection appropriate to the chosen plan;
- independent R2 backup/versioning/recovery mechanism;
- backup storage/account isolation and geographic requirements;
- backup encryption/key ownership and rotation;
- backup schedule and retention;
- recovery operator, break-glass, and multi-person approval requirements;
- deployment configuration recovery source of truth;
- operational monitoring/alerting and external audit/SIEM archival;
- full D1/R2 reconciliation tooling;
- production recovery-drill cadence; and
- interaction with future retention/legal-hold/destructive-disposition requirements.

Those decisions require explicit architecture/operations review before production customer data is
allowed.

## Cost and implementation impact

Foundation II provisions no production resource, purchases no security product, and adds no runtime
service. Expected new recurring cost is **$0**.
