# Architecture

## Context

Document Control is a tenant-aware modular monolith running at the Cloudflare edge. The first
release favors understandable boundaries, strong document-control invariants, and portable records
over a broad feature set.

```text
HTTP request
  -> Hono routes / semantic server-rendered UI
  -> application services and provider ports
  -> domain rules (framework independent)
  -> D1 DatabaseProvider + R2 ContentStore adapters
```

## Boundaries

- **Domain** owns tenant, workspace, identity/member, role, document/version, controlled template,
  workflow, review, approval, and audit concepts. It imports no Hono, D1, R2, or ORM API.
- **Application** coordinates domain rules, declares `DatabaseProvider` and `ContentStore`, and owns
  the portable export validation contract.
- **Infrastructure** adapts D1/SQLite and R2 to those ports and owns safe storage-key construction.
  A PostgreSQL database provider and SharePoint content store can be added later without changing
  approval or workflow rules.
- **Presentation** produces semantic HTML. Focused client-side TypeScript may be introduced for
  progressive enhancement when a real interaction requires it; the bootstrap ships no SPA.

## Schema authority

`migrations/0001_initial.sql` is the authoritative executable D1/SQLite schema for the bootstrap.
It contains the relational constraints, indexes, and triggers that enforce critical invariants.
A separately maintained ORM schema is intentionally not authoritative because silent drift between
schema descriptions is more dangerous than the convenience it provides at this stage.

A typed query layer can be added later if it is generated from, or mechanically checked against,
the executable schema.

## Tenant isolation

Every tenant-owned record carries `tenant_id`. Composite foreign keys tie workspaces, documents,
document versions, templates, workflow instances, reviews, approvals, and audit records to the same
tenant boundary. The database rejects a record that names tenant A while referencing tenant B's
workspace/document/version.

These relational guarantees complement, but do not replace, application authorization. Every query
must still be scoped to the active tenant and workspace where applicable.

## Identity and roles

The data model separates application identity metadata from authentication. `identity_subjects`
represent people or external identities without storing passwords, tokens, or other credentials.
`tenant_memberships` connect subjects to tenants.

Role definitions are data, not a hard-coded enum. System defaults establish the initial product
roles (Platform Administrator, Tenant Administrator, Workspace Administrator, Workflow
Administrator, Template Manager, Document Owner, Author, Reviewer, Approver, Auditor, and Viewer),
while tenant-specific role definitions can be added later. Role bindings carry platform, tenant, or
workspace scope and are checked against membership and workspace boundaries.

Production authentication/SSO remains a separate future decision.

## Controlled templates

Templates are controlled records with immutable content/provenance per version. Template versions
move through:

`Draft -> Review -> Approved -> Published -> Superseded -> Retired`

The content hash, content location, creator, provenance, and creation timestamp of a template version
cannot be rewritten. Lifecycle timestamps can advance as the version is published or superseded.
Documents created from a template preserve the exact template ID, version number, source hash, and
provenance path. A later template update therefore cannot silently alter an existing document's
origin.

## Versioned workflows

Workflow definitions are versioned data containing their own states and transitions. A workflow
instance records the exact definition ID/version it started with and can transition only according
to that definition. Editing or publishing a later workflow definition does not rewrite an existing
instance's rules or history.

The database additionally verifies that a persisted workflow state exists in the bound definition.

## Content and metadata

D1 stores application metadata, relationships, and evidence. R2 stores document/template binaries.
Application-owned builders create tenant/workspace/document-or-template/version scoped storage keys;
callers do not invent arbitrary object paths.

Version content is create-once. R2 writes use a conditional precondition so an existing version key
cannot be silently overwritten. The application computes SHA-256 from the bytes before writing and
again when reading evidence. R2 custom metadata is informative, not trusted as the source of truth.

The current adapter materializes bytes in memory and is appropriate for the synthetic/bootstrap
stage. Streaming and production upload limits must be designed before customer uploads are enabled.

## Approval invariant

An approval records:

- tenant and document;
- exact document-version ID;
- exact SHA-256 content hash;
- approving identity subject;
- exact workflow-instance ID;
- workflow definition ID and version;
- timestamp.

The database and domain layer both require these values to agree. Applicability requires the exact
version ID and hash to match. Creating version 2 does not mutate or extend an approval for version 1.

## Audit model

Audit events are append-only. SQLite triggers reject updates and deletes. Corrections are new events
that reference what is being corrected; history is not rewritten.

## Portability

Export v1 contains the tenant/configuration, identity subjects, memberships, role definitions and
bindings, workspaces, documents/versions, templates/versions/provenance, workflow definitions and
instances, reviews, approvals, audit events, and storage references.

Import parsing validates structure, references, tenant boundaries, workflow references, template
provenance, and exact approval evidence before accepting the data. A complete offline package will
later add a manifest plus optional document binaries and checksum verification. See
`docs/contracts/export-v1.md`.

## Security posture

- No arbitrary public uploads in the public demo.
- No analytics, trackers, external fonts, or third-party runtime scripts.
- Strict response headers and an allowlist-oriented Content Security Policy.
- Repository CI performs formatting, linting, strict TypeScript, executable migration/invariant
  tests, content-hash tests, browser/accessibility tests, dependency audit, and current/history
  secret detection.
- Production authentication, authorization enforcement, malware scanning, retention, key
  management, backup/recovery, and regulated-data deployment profiles require explicit design and
  approval before customer data.
