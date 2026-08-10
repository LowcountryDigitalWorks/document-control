# Handoff

## Authoritative state

`main` is the authoritative product foundation.

Merged milestones before the workspace-read slice:

- PR #1, bootstrap foundation → `e5902256cfbe1f36b67143cae8daf687fe684732`.
- PR #7, persisted document workflow → `2c4d07c54738d59dcdceaa488d9deeafd39853d1`.
- PR #8, provider-neutral authorization boundary → `119f6d8d29291662b5ec5c788706f1d093723bac`.
- PR #9, authorized guided workflow UI → `bbc9e381b5e3b8ba93bad3a232bfbb716cdb0cf1`.

The repository is public by explicit owner decision. Package metadata remains `private: true` only to
prevent accidental package-registry publication. No production Cloudflare resources, customer data,
paid services, analytics, or public-upload capability exist.

Normal development uses this repository, branches/pull requests, and GitHub Actions. Codex is not a
routine development or release dependency.

## Foundation decisions

- TypeScript + Hono modular monolith on Cloudflare Workers.
- D1/SQLite stores relational application metadata; R2 stores binaries.
- SQL migrations are authoritative executable schema/data evolution.
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

## Persisted workflow capability

The application-service layer supports:

`published template -> document/version -> workflow -> review -> exact-version approval -> changed version -> prior approval does not apply to new version -> audit evidence`

Related D1 metadata/state mutations use database batches. The application does not claim an atomic
transaction across R2 binary creation and D1 metadata. Upload orchestration and compensation remain
future work before customer uploads.

## Authorization boundary

Authorization is intentionally separate from authentication.

- `AuthorizationPolicy` defines the provider-neutral enforcement boundary.
- Built-in roles receive explicit permission defaults in `0002_system_role_permissions.sql`.
- `DatabaseAuthorizationPolicy` evaluates configurable role definitions/bindings at platform, tenant,
  and workspace scope.
- Active tenant membership is required for tenant/workspace access; a platform administrator remains
  a deliberate global role.
- Workspace scope can be resolved through workspace, document, or workflow-instance resources while
  preserving the requested tenant boundary.
- `AuthorizedDocumentWorkflowService` gates workflow mutations and evidence reads.
- `AuthorizedWorkspaceReadService` gates workspace overview, document-list, and template-list reads.
- Authentication/SSO selection is still deferred; no production credentials or identity-provider
  secrets are stored by these boundaries.

## Synthetic demo/app boundary

The repository includes synthetic HTTP/UI paths that exercise the real authorization and persistence
services. They are intentionally disabled unless `DEMO_MUTATIONS_ENABLED=true`.

The browser supplies only navigation and the next allowed guided action. The server assigns all
synthetic tenant, workspace, identity, role, workflow, template, and document context.

Each browser context receives an opaque UUID through an HttpOnly, SameSite=Strict cookie scoped to
`/demo`. The UUID is validated by the server and used only to namespace server-generated synthetic
record IDs. It is not an identity credential and does not encode tenant/user/role authority.
Independent browser contexts therefore receive independent synthetic tenants and application state.

Current synthetic routes include:

- `/demo/workflow` for the guided exact-version lifecycle;
- `/demo/app` for workspace overview;
- `/demo/app/documents` for the authorized document list;
- `/demo/app/templates` for the authorized controlled-template list.

The ordinary workspace screens read the same isolated synthetic records as the guided workflow, so a
synthetic document created through the guided path appears in that session's Documents screen while
remaining invisible to another independent session.

POST workflow actions require a same-origin `Origin` header. There are no arbitrary input fields or
file uploads in the guided flow.

**Do not enable these interactive routes on a shared public deployment yet.** The cookie has a
one-hour browser lifetime, but cookie expiration does not delete D1 rows. Public enablement requires a
durable server-side demo-session lifecycle with expiration/purge, quotas, rate limiting,
Turnstile/abuse controls, and operational cleanup first.

## Continue locally

1. Install Node.js 22 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm db:migrate:local` so both migrations are applied.
4. Run `pnpm dev` for the normal Worker; synthetic interactive routes remain disabled by default.
5. Run `pnpm test:e2e` to exercise the isolated guided workflow and workspace read navigation through
   the SQLite-backed D1 test binding.
6. Run `pnpm check` and `pnpm test:e2e` before proposing changes.

## Next product slice

After the workspace-read navigation slice is merged, add an authorized **document detail/evidence
view** before introducing editing or uploads.

Recommended detail view should show:

- document identity and current status;
- version history;
- exact approval applicability per version;
- workflow/review evidence;
- audit timeline;
- source-template ID/version/hash/provenance where applicable.

Keep it read-only and synthetic/test-only initially. This deepens the ordinary document-control user
experience while preserving the current clean authorization boundary and avoiding production identity
or upload decisions.

A separate later slice should implement public-demo session persistence, expiry/purge, quotas, rate
limits, Turnstile, and reset behavior before any shared public interactive deployment is approved.

Keep arbitrary/customer uploads out of scope until permitted-data policy, content types, size limits,
malware scanning, retention, authorization, backup/recovery, and failure/compensation behavior are
explicitly approved.
