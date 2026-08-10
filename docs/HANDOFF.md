# Handoff

## Authoritative state

`main` is the authoritative product foundation. Bootstrap PR #1 was squash-merged on 2026-08-10 as
commit `e5902256cfbe1f36b67143cae8daf687fe684732`.

The repository is public by explicit owner decision. Package metadata remains `private: true` only to
prevent accidental package-registry publication. No production Cloudflare resources, customer data,
paid services, analytics, or public-upload capability exist.

The active post-bootstrap workstream is the persisted document-workflow slice. Normal development is
performed through this repository, GitHub pull requests, and GitHub Actions; Codex is not a routine
release dependency.

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

## Persisted workflow slice

The application-service layer now supports the core persisted sequence:

`published template -> document/version -> workflow -> review -> exact-version approval -> changed version -> prior approval does not apply to new version -> audit evidence`

Important behavior:

- related D1 metadata/state mutations are submitted as transactional database batches;
- document creation preserves exact approved-template provenance;
- workflow instances are pinned to exact document and workflow-definition versions;
- accepted reviews advance to approval through the bound workflow definition;
- approval and state changes are persisted together and only for the current document version;
- a workflow for an older version is rejected if a newer version became current before approval;
- changed versions return the document to draft without mutating historical approvals;
- service methods enforce canonical SHA-256 hashes and application-owned content keys.

The application service does not create or claim an atomic transaction across R2 and D1. Customer
upload orchestration, compensation behavior, malware scanning, content limits, retention, and recovery
must be designed before production uploads are enabled.

## Continue locally

1. Install Node.js 22 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm db:migrate:local`.
4. Run `pnpm dev` and open `http://127.0.0.1:8787`.
5. Run `pnpm check` and `pnpm test:e2e` before proposing changes.

## Next product slice

After the persisted workflow service is merged, wire it into tenant-scoped HTTP/UI routes using the
existing D1 binding and synthetic/demo-safe data. The UI should let a user understand the document
lifecycle without GRC terminology and should visibly show that an approval applies to one exact
version but not to a later changed version.

Keep production authentication and arbitrary/customer uploads out of that slice. Introduce an
explicit authorization boundary/interface before selecting a production identity provider.

Do not introduce customer uploads until permitted-data policy, allowed content types, size limits,
malware scanning, retention, authorization, backup/recovery, and failure/compensation behavior are
explicitly approved.
