# Document Control Handoff

## Authority

`main` is the authoritative product source after each approved pull request is merged. Before any new
work, inspect current `main`, open/recent pull requests, `README.md`, `docs/STATUS.md`, migrations,
workflow/tests, and the latest GitHub Actions results rather than relying on this file alone.

Repository: `LowcountryDigitalWorks/document-control`

The repository is intentionally public by owner decision. Package metadata remains `private: true`
only to prevent accidental package-registry publication. No production customer deployment, customer
data, arbitrary uploads, paid service, analytics, or production authentication is authorized by the
current repository state.

## Current architecture

- TypeScript + Hono modular monolith targeting Cloudflare Workers.
- D1/SQLite for relational application metadata behind `DatabaseProvider`.
- R2 as the initial binary-content provider behind `ContentStore`.
- Ordered SQL files in `migrations/` are the authoritative executable schema/evolution source.
- Application-owned content keys and SHA-256 content identity protect version/object integrity.
- Provider-neutral identity subjects, memberships, configurable roles, scoped role bindings, and
  permission evaluation keep authorization independent from future authentication/SSO.
- Authentication source is not authorization: `local`, `oidc`, `saml`, `entra`, and `external`
  subjects resolve into the same application-owned membership/role-binding model.
- A small customer may use directly provisioned/app-managed membership and roles without an
  enterprise directory. Future Entra ID/Active Directory-connected, OIDC, or SAML deployments should
  map external principals/groups into the same internal roles instead of replacing the permission
  model.
- Workflow definitions are immutable/versioned; workflow instances execute the exact version they
  started with.
- Controlled templates are versioned and preserve exact source provenance.
- Approvals bind an actor and timestamp to exact document-version/hash/workflow evidence.
- Audit records are append-only.
- Portable export is versioned and validates structure, references, tenant boundaries, provenance,
  workflow evidence, approvals, roles/bindings, workspace workflow selection, and workflow lifecycle
  information.

See `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md` for the durable identity-provider / authorization
separation and future group-mapping requirements.

## Implemented product slices

The synthetic/test-only application now covers:

- persisted document workflow lifecycle;
- provider-neutral authorization;
- guided workflow execution;
- workspace Overview, Documents, Templates, document evidence, Reviews, and Approvals;
- bounded metadata search/filtering;
- Backup & Portability export;
- Audit Log;
- tenant presentation administration;
- provider-neutral tenant member administration with direct app-local provisioning and Staged / Active /
  Suspended membership lifecycle;
- workspace Roles & Access assignment administration;
- tenant-owned custom workspace role creation/editing with bounded operational permissions and
  tenant-wide assignment-impact acknowledgement;
- immutable Workflow Definition administration;
- controlled Template Lifecycle administration;
- workspace Workflow Selection/default-version administration; and
- controlled Workflow Definition lifecycle administration.

See `docs/STATUS.md` and Git history for the detailed invariant/test record for each merged slice.

## Tenant member lifecycle and provisioning boundary

Tenant membership is application-owned and separate from the authentication provider.

- The member administration surface requires tenant-level `tenant.manage`.
- Directly provisioned members use the `local` provider marker and store identity metadata only; no
  password, MFA secret, token, recovery code, or invitation credential is created.
- User-facing membership states are **Staged**, **Active**, and **Suspended**. Staged is stored as
  `invited`, but no invitation email is sent by the current slice.
- Active is the authorization-eligible state. The existing authorization policy already denies
  tenant/workspace access when membership is not active.
- Suspension preserves tenant/workspace role bindings, provider attribution, and historical/audit
  references rather than deleting them.
- A tenant administrator cannot suspend their own current membership from this surface.
- Direct provisioning rejects a duplicate email already represented by another member of the same
  tenant.
- Externally sourced subjects, including Entra-backed identities, use the same membership lifecycle;
  changing application membership does not modify the external identity provider.
- Member deletion is intentionally not implemented.

Future production identity work must decide authentication, invitation delivery, Entra/AD/OIDC/SAML
provisioning, JIT/SCIM synchronization, group mapping, and deprovisioning reconciliation separately.

## Custom role and identity boundary

Tenant-owned custom workspace roles are application authorization objects, not identity-provider
objects.

- Custom roles may use the bounded operational permission set exposed by the application.
- They cannot grant wildcard `*`, `tenant.manage`, `workspace.manage`, or `role.manage`.
- Built-in system roles remain immutable and continue to carry administrative authority.
- Creating or editing a custom role requires tenant-level `tenant.manage` plus current-workspace
  `role.manage`.
- Assigning an existing eligible workspace role remains a current-workspace `role.manage` action.
- When a custom role has assignments anywhere in the tenant, its edit surface shows those affected
  member/workspace assignments and requires explicit acknowledgement before changing the role.
- Custom-role changes append `role.definition.created` / `role.definition.updated` evidence to the
  existing audit stream.
- Custom roles and their bindings are already represented by the existing portable export model.

Custom-role deletion is intentionally not implemented yet. A future delete/retire design must define
historical/audit behavior and current-binding handling rather than silently removing a role definition.

Do **not** couple custom roles to Microsoft-specific group names or claims. A future Entra ID/AD/OIDC/
SAML provisioning or mapping adapter should resolve immutable external subject/group identifiers to
these application roles. Small customers can use the same roles directly without an external IdP.

## Workflow Definition lifecycle terminology

User-facing administration uses three distinct lifecycle labels:

- **Active** — available for new workspace assignment and new default selection.
- **Legacy** — existing workspace use may continue, but the version cannot be newly assigned or newly
  selected as a default. It may be returned to Active.
- **Retired** — terminal historical-only state. The exact version must be removed from every workspace
  before retirement.

The canonical persisted/exported machine value for **Legacy** is `deprecated`. Do not expose
“Deprecated” as the normal product label; retain it only as the internal schema/domain/export value
unless a deliberate migration changes that contract later.

Lifecycle changes never rewrite workflow-definition content. Existing workflow instances, reviews,
approvals, and audit evidence remain pinned to their original exact workflow version.

## Synthetic application boundary

Interactive synthetic routes are disabled unless `DEMO_MUTATIONS_ENABLED=true`.

The browser supplies navigation/form actions only. Tenant, workspace, identity, role, permission,
workflow, template, and document authority remain server-controlled. Synthetic browser contexts use
opaque HttpOnly, SameSite=Strict session namespaces and are independently isolated.

Same-origin mutation protection remains required.

**Do not enable the interactive application on a shared public deployment yet.** A one-hour browser
cookie does not purge D1 records. Public enablement requires deliberate server-side session
expiration/purge, quotas, rate limiting, Turnstile or equivalent abuse controls, operational cleanup,
and validation before it can be considered safe.

## Production boundaries still unresolved

Do not imply these are implemented or approved:

- production authentication/SSO/provider configuration;
- Entra ID/Active Directory/OIDC/SAML application registration or connection;
- production invitation delivery, external identity provisioning, JIT/SCIM-style synchronization,
  or identity-provider/group mapping;
- tenant/platform role-assignment administration or system-role editing;
- custom-role deletion/retirement;
- arbitrary/customer file uploads;
- upload orchestration across D1 and binary storage;
- malware scanning, file-type/size policy, quarantine, or failure compensation;
- production D1/R2/Worker provisioning or custom-domain attachment;
- complete binary backup/restore, retention automation, legal hold, or disaster recovery;
- richer workflow authoring beyond current immutable definitions/version/lifecycle controls;
- template content upload/new-version authoring or new-template upload flows;
- full-text/content-body search or external search infrastructure;
- PostgreSQL/SharePoint production adapters;
- analytics, AI services, or paid SaaS dependencies.

Any production infrastructure or recurring-cost change requires current-state inspection, proposed
state, rollback, and Eddie's explicit approval.

## Normal development and validation

Use branches and pull requests for meaningful changes. Normal pull-request CI is intentionally
read-only. Temporary maintenance helpers must not remain in a final pull-request diff.

Expected validation includes, as applicable:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm secrets:scan
pnpm test:unit
pnpm build
pnpm test:e2e
pnpm audit --audit-level=high
```

The exact final pull-request head should pass the normal `quality`, `browser`, and `secrets` jobs
before merge. Preserve existing accessibility, responsive, tenant-isolation, authorization,
exact-version evidence, cross-origin, portability, and history-aware secret-scan coverage.

## Continuation procedure

At the start of a replacement development chat:

1. Confirm the connected GitHub identity is `Eddie-LowcountryDigitalWorks`.
2. Inspect `LowcountryDigitalWorks/document-control` current `main` and all open/recent PRs.
3. Read `README.md`, `docs/STATUS.md`, this handoff, `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md`,
   migrations, package/lock files, CI, and tests.
4. Confirm there are no failed or unfinished maintenance/dependency PRs that should be resolved first.
5. Reconcile the roadmap against the actual merged product state before choosing the next slice.
6. Keep production infrastructure, customer data, arbitrary uploads, authentication-provider
   selection/configuration, and paid services outside scope unless Eddie explicitly approves the
   relevant design and change-control boundary.

Do not resume from old milestone numbers or old “next slice” text without live repository inspection.
