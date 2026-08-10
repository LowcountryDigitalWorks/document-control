# Handoff

## Authoritative state

The default branch remains authoritative until bootstrap PR #1 is reviewed and merged. The active
bootstrap branch is `codex/initial-document-control-bootstrap`; the branch name reflects its origin
only and does not require Codex for continuing development.

The repository is public by explicit owner decision. No production Cloudflare resources or customer
data exist in this bootstrap.

## Foundation decisions

- TypeScript + Hono modular monolith on Cloudflare Workers.
- D1/SQLite stores relational application metadata; R2 stores binaries.
- `migrations/0001_initial.sql` is the authoritative executable schema.
- Core code stays vendor-independent behind `DatabaseProvider` and `ContentStore` ports.
- R2 version objects are create-once and their bytes are SHA-256 verified.
- Content keys are built by application-owned tenant/workspace/version key builders.
- Identity metadata is provider-neutral; production authentication remains undecided.
- Roles are configurable definitions plus scoped bindings rather than a closed enum.
- Workflow instances execute the exact versioned workflow definition they were created with.
- Templates are controlled/versioned records with lifecycle and provenance.
- Approvals bind exact version ID + SHA-256 + actor + workflow instance + workflow definition/version.
- Audit records are append-only.
- Export v1 validates structure, references, tenant boundaries, template provenance, workflows, and
  approval evidence.
- The LDW theme is a configurable reference theme; final colors/assets are not hard-coded decisions.
- Bear Necessities is a candidate deployment/offering tier, not a domain/product architecture name.

## Continue locally

1. Install Node.js 22 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm db:migrate:local`.
4. Run `pnpm dev` and open `http://127.0.0.1:8787`.
5. Run `pnpm check` and `pnpm test:e2e` before proposing changes.

## Required pre-merge review for PR #1

Confirm the latest GitHub Actions run is green for quality, browser/axe, and secret scanning. Review
all changes against the product-review comment on PR #1 and confirm no unresolved review findings.
Do not merge automatically.

## Next vertical slice after bootstrap merge

Persist the synthetic document-control lifecycle through application services and D1/R2 while
keeping production authentication and public uploads out of scope:

`published template -> document -> immutable version -> review -> approval -> changed version -> old approval no longer applies -> audit -> portable export`

The next slice should introduce an explicit authorization boundary/interface and tenant-scoped
service methods without committing to an identity provider. Production authentication can then be
selected separately based on the deployment profile.

Do not introduce customer uploads until permitted-data policy, content types, size limits, malware
scanning, retention, authorization, and recovery expectations are explicitly approved.
