# ADR 0002: D1/SQLite as the initial production persistence architecture

- Status: Accepted
- Date: 2026-08-12

## Context

Document Control was intentionally designed so its document-control concepts and security invariants
are not defined by a web framework or database SDK. The current application nevertheless uses
`DatabaseProvider` as a thin SQL execution boundary: application services provide SQL strings and
parameters, while the D1 adapter prepares and executes those statements.

That boundary keeps D1 API details out of domain/application code, but it does **not** make the
application persistence implementation drop-in provider-neutral. Current queries, migrations,
constraints, triggers, and transaction assumptions are materially coupled to D1/SQLite semantics.
Treating another relational database as a provider swap would understate the work required to adapt
queries and reproduce the same database-enforced invariants.

A broad abstraction rewrite would add cost and complexity before a second relational persistence
requirement exists.

## Decision

**D1/SQLite is the accepted initial production persistence architecture for Document Control. Domain
and business rules remain provider-independent. Persistence implementation portability will be
improved incrementally where justified by real production capabilities.**

The provider-independent boundary primarily protects:

- tenant/workspace/document/template/workflow domain concepts;
- document-control invariants;
- workflow rules and exact workflow-definition version binding;
- exact document-version/SHA-256 approval semantics;
- controlled-template provenance rules;
- append-only audit semantics; and
- application authorization policy and permission semantics.

The current application persistence implementation is materially SQL/SQLite coupled.
`DatabaseProvider` exposes raw `query`, `execute`, and `executeBatch` operations. Substituting a new
implementation of that interface does not, by itself, make current application services ready for
PostgreSQL or another SQL dialect.

Ordered files under `migrations/` remain the authoritative executable D1/SQLite schema and evolution
source for the accepted initial architecture.

## Consequences

- Production-readiness work may optimize for one well-understood relational metadata/state store
  rather than maintaining speculative database parity.
- Existing D1/SQLite relational constraints and triggers remain valuable defense in depth for tenant,
  version, workflow, approval, template, and audit invariants.
- Documentation must distinguish domain/business-rule portability from persistence implementation
  portability.
- PostgreSQL remains a possible future adaptation target, not a current drop-in capability.
- A future second database adapter may require query translation, schema/constraint redesign,
  transaction-behavior analysis, migration tooling, and dedicated compatibility tests.

## Future strategy

Improve persistence portability narrowly and incrementally when a production capability creates
concrete value for doing so. Prefer focused repository/query ports around a bounded read or write
capability, for example when a production integration needs a stable business-level contract whose
storage query should live entirely at the infrastructure boundary.

Do not introduce solely for hypothetical portability:

- a universal repository abstraction;
- a generic CRUD layer;
- an ORM migration;
- a PostgreSQL adapter;
- a database rewrite; or
- speculative abstraction layers that obscure existing invariants.

A narrow port should have a clear caller, business meaning, authorization boundary, test contract,
and reason why moving its SQL out of application code improves production maintainability or enables
a real second persistence implementation.

## Revisit criteria

Revisit this decision when at least one concrete condition exists, such as:

- an approved customer/deployment requirement needs a relational store other than D1/SQLite;
- a production capability is blocked by a D1/SQLite limitation that cannot be acceptably addressed
  within the current architecture;
- operational, scale, locality, resilience, or data-ownership requirements justify a second
  relational implementation;
- repeated production work demonstrates a coherent bounded query/repository contract worth extracting;
  or
- a second implementation can be validated without weakening tenant isolation, exact-version approval,
  workflow, template provenance, audit, or authorization invariants.

Any future persistence adaptation requires its own architecture decision, migration/rollback plan,
and invariant/upgrade-path validation. This ADR does not authorize PostgreSQL or any other database
implementation.
