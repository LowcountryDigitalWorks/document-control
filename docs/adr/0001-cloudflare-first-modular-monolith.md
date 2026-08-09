# ADR 0001: Cloudflare-first modular monolith

- Status: Proposed
- Date: 2025-08-23

## Context

The first implementation needs strong document/version invariants, portability, low operational
overhead, and a credible path to a public synthetic demonstration. It does not yet need the
coordination cost of multiple services or a large client-side framework.

## Decision

Use a TypeScript modular monolith on Cloudflare Workers with Hono for HTTP routing, D1 for
relational metadata, R2 for binaries, Drizzle for typed schema declarations, semantic
server-rendered HTML, custom CSS tokens, Vitest, Playwright, axe-core, and Wrangler.

Keep domain code independent of vendors. Access metadata through `DatabaseProvider` and content
through `ContentStore`; D1/SQLite and R2 are the first adapters, with PostgreSQL and SharePoint as
future adapter targets.

## Consequences

- The MVP is inexpensive and deploys as one unit.
- Transactional metadata remains inside one SQLite-compatible database.
- Vendor APIs stay at the infrastructure edge.
- Cross-region scale and enterprise integrations may require later adapters or architecture
  changes, but not a rewrite of approval rules.
- The application deliberately avoids React, a CMS, a separate server, queues, Redis, vector
  databases, and AI services until requirements justify them.
