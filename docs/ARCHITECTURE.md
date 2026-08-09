# Architecture

## Context

Document Control is a tenant-aware modular monolith running at the Cloudflare edge. The first
release favors understandable boundaries and portable records over a broad feature set.

```text
HTTP request
  -> Hono routes / semantic server-rendered UI
  -> application services and provider ports
  -> domain rules (framework independent)
  -> D1 DatabaseProvider + R2 ContentStore adapters
```

## Boundaries

- **Domain** owns tenant, workspace, role, document/version, template, workflow, review,
  approval, and audit concepts. It imports no Hono, D1, R2, or Drizzle API.
- **Application** coordinates domain rules and declares `DatabaseProvider` and `ContentStore`.
- **Infrastructure** adapts D1/SQLite and R2 to those ports. A PostgreSQL database provider and
  SharePoint content store can be added later without changing approval rules.
- **Presentation** produces semantic HTML. Focused client-side TypeScript may be introduced for
  progressive enhancement when a real interaction requires it; the bootstrap ships no SPA.

## Tenant isolation

Every tenant-owned table carries `tenant_id`. Application queries must require the active tenant
scope even when the entity ID is globally unique. Database foreign keys and composite indexes
support, but do not replace, application authorization. Authentication and production identity
mapping remain intentionally undecided until deployment requirements are approved.

## Content and metadata

D1 stores metadata and evidence. R2 stores binary content at tenant- and document-scoped keys.
The version row records a canonical SHA-256 hash of the exact bytes. Content is written before a
version becomes available for review; failed metadata writes require orphan cleanup by a
separate maintenance process.

## Approval invariant

An approval records:

- tenant and document;
- exact document-version ID;
- exact SHA-256 content hash;
- actor;
- workflow definition ID and version;
- timestamp.

Applicability requires both the version ID and hash to match. Creating version 2 does not mutate
or extend an approval for version 1.

## Audit model

Audit events are append-only. SQLite triggers reject updates and deletes. Corrections are new
events that reference the event being corrected; they do not rewrite history.

## Portability

The versioned JSON export contains application records. A complete future export also packages
R2 objects with a manifest and verified hashes. See `docs/contracts/export-v1.md`.

## Security posture

- No arbitrary public uploads in the public demo.
- No analytics, trackers, external fonts, or third-party runtime scripts.
- Strict response headers and an allowlist-oriented Content Security Policy.
- Repository CI performs static checks, unit and browser tests, dependency audit, and secret
  detection.
- Production authentication, authorization enforcement, malware scanning, retention, key
  management, and disaster recovery require explicit threat modeling before customer data.
