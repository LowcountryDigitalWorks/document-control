# Handoff

## Authoritative state

`main` is the authoritative product foundation.

Merged milestones before the guided UI slice:

- PR #1, bootstrap foundation → `e5902256cfbe1f36b67143cae8daf687fe684732`.
- PR #7, persisted document workflow → `2c4d07c54738d59dcdceaa488d9deeafd39853d1`.
- PR #8, provider-neutral authorization boundary → `119f6d8d29291662b5ec5c788706f1d093723bac`.

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
- `AuthorizedDocumentWorkflowService` is the required facade for HTTP/UI workflow operations. Routes
  must not invoke the raw persistence service directly.
- Authentication/session/SSO selection is still deferred; no credentials or provider secrets are
  stored by this boundary.

## Guided workflow UI boundary

The repository includes a guided synthetic HTTP/UI path that exercises the real authorization and
persistence services. It is intentionally disabled unless `DEMO_MUTATIONS_ENABLED=true`.

The browser supplies only the next allowed guided action. The server assigns all synthetic tenant,
workspace, identity, role, workflow, template, and document context.

Each browser context receives an opaque UUID through an HttpOnly, SameSite=Strict cookie scoped to
`/demo/workflow`. The UUID is validated by the server and used only to namespace server-generated
synthetic record IDs. It is not an identity credential and does not encode tenant/user/role authority.
Independent browser contexts therefore receive independent synthetic tenants and workflow state.

POST actions require a same-origin `Origin` header. There are no arbitrary input fields or file
uploads in the guided flow.

**Do not enable this interactive route on a shared public deployment yet.** The cookie has a one-hour
browser lifetime, but cookie expiration does not delete D1 rows. Public enablement requires a durable
server-side demo-session lifecycle with expiration/purge, quotas, rate limiting, Turnstile/abuse
controls, and operational cleanup first.

## Continue locally

1. Install Node.js 22 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm db:migrate:local` so both migrations are applied.
4. Run `pnpm dev` for the normal Worker; guided mutations remain disabled by default.
5. Run `pnpm test:e2e` to exercise the isolated guided workflow through the SQLite-backed D1 test
   binding.
6. Run `pnpm check` and `pnpm test:e2e` before proposing changes.

## Next product slice

After the guided workflow UI is merged, keep the interactive demo disabled publicly and build the
next ordinary application surface without choosing production authentication prematurely.

Recommended next slice: tenant/workspace document and template **read/navigation screens** backed by
the authorization boundary, using synthetic/test identity context only. This begins turning the
guided proof into understandable product navigation while avoiding customer uploads and public demo
abuse exposure.

A separate later slice should implement public-demo session persistence, expiry/purge, quotas, rate
limits, Turnstile, and reset behavior before any shared public interactive deployment is approved.

Keep arbitrary/customer uploads out of scope until permitted-data policy, content types, size limits,
malware scanning, retention, authorization, backup/recovery, and failure/compensation behavior are
explicitly approved.
