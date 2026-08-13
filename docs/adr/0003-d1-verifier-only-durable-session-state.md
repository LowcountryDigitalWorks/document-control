# ADR 0003: D1 verifier-only durable authenticated session state

- Status: Accepted
- Date: 2026-08-12

## Context

Production Identity & Tenant Boundary I established provider-neutral authenticated-session contracts,
but its initial `SessionStore` contract used the raw 256-bit browser bearer session identifier as the
store lookup key. That was sufficient for a local/test-only in-memory boundary, but it is not an
acceptable durable storage contract: disclosure of a database containing live raw bearer identifiers
would directly disclose usable session cookies.

Document Control already accepts D1/SQLite as its initial production metadata/state persistence
architecture under ADR 0002. Durable authenticated-session state needs immediate authoritative
revocation, expiry, collision-safe creation, and rotation semantics. Authentication truth must not
come from an eventually consistent cache or secondary index, and cleanup timing must not determine
whether a session is valid.

The browser bearer token is already cryptographically random and 256 bits. It therefore does not need
password-hashing semantics intended to compensate for low-entropy human secrets. It needs a
non-reversible, fixed-format verifier so persistent storage cannot be copied directly into a browser
cookie.

## Decision

**D1/SQLite is the accepted initial durable authenticated-session state store. Persistent session rows
are keyed only by a domain-separated SHA-256 verifier derived from the 256-bit random browser bearer
token. The raw bearer token is never persisted by the durable session store.**

The boundary is:

`256-bit browser bearer -> domain-separated SHA-256 verifier -> authoritative D1 session row`

The browser bearer token:

- is generated using platform cryptographic randomness;
- is returned only to the session-delivery boundary;
- remains the credential presented by the browser;
- is validated for a fixed 64-lowercase-hex format; and
- is never written to the D1 session table or security-audit event model.

The durable verifier:

- is `SHA-256("ldw.document-control.session.v1\\0" + bearer)`;
- is represented as exactly 64 lowercase hexadecimal characters;
- is the D1 primary-key lookup value;
- is not a bearer credential accepted by the HTTP cookie parser; and
- is never emitted in security-audit events.

Database disclosure therefore does not directly disclose usable browser session tokens. Because the
source bearer is cryptographically random 256-bit material, this architecture intentionally does not
add a slow password hash, salt database, or password-derived key function.

## Authoritative validity

D1 session state is authoritative for:

- verifier existence;
- subject binding;
- authentication/creation timestamps;
- absolute expiry; and
- explicit revocation.

A session is invalid immediately when:

- the verifier is unknown;
- the row is revoked; or
- the row is expired.

Expired or revoked rows may be deleted asynchronously later. Cleanup is storage hygiene only and is
never an authentication decision.

No KV, cache, TTL service, secondary eventually consistent index, or browser-carried authorization
claim is accepted as session truth.

## Rotation

Rotation generates a new independent browser bearer and verifier while preserving the original
session expiry. D1 `batch()` is used as one transactional unit to:

1. conditionally revoke the current active verifier and bind that revocation to the exact intended
   replacement verifier; and
2. insert the replacement row only when the old row records that exact replacement verifier.

The old row therefore becomes unusable immediately, and a replacement-verifier collision causes the
batch to fail rather than leaving the original session partially revoked. The
`replaced_by_verifier` marker is itself only a verifier digest; it is not a browser bearer and is not
part of the audit model.

## Schema evolution

Migration `0012_authenticated_session_verifiers.sql` creates the durable session table and cleanup
indexes. It is a forward-only migration under the existing immutable migration discipline.

The supported upgrade assurance for this release is:

- empty database -> migrations through `0012`; and
- immediately prior schema `0011` -> `0012`.

No raw bearer values are migrated because no durable session table existed before `0012`.

## Recovery behavior

Authenticated sessions are security credentials, not durable business records. Recovery of the
application schema must include the `authenticated_sessions` table definition, but stale backed-up
session rows must **not** be treated as a reason to resurrect prior authenticated access.

Production recovery policy should prefer invalidating recovered session rows and requiring users to
reauthenticate after a restore or disaster-recovery event unless a later explicitly approved design
provides a stronger freshness/revocation guarantee. Recovery evidence must never contain raw bearer
tokens.

## Authorization boundary

A valid durable session establishes only an internal authenticated subject context. It does not grant
Document Control permissions.

The authoritative chain remains:

`validated external principal -> application-owned identity subject -> active tenant membership -> internal role binding -> required permission -> tenant/workspace/resource scope`

Current membership, role bindings, permissions, and resource scope continue to be evaluated by the
existing authorization services after session authentication.

## Consequences

- Database compromise alone does not directly reveal usable session cookies.
- D1 becomes a security-sensitive authoritative persistence dependency for authenticated-session
  validity and revocation.
- Production availability and recovery planning must account for authentication failure when D1
  session state is unavailable.
- Rotation requires transactional D1 semantics and cannot be safely moved to an eventually consistent
  store without a new architecture review.
- Session cleanup can be delayed without extending session validity.
- Session verifier rows and replacement-verifier markers remain sensitive operational metadata even
  though they are not bearer credentials.
- No new paid service or persistent cache is introduced.

## Deferred decisions

This ADR does not authorize or select:

- a live identity provider;
- a production application registration;
- provider credentials or signing certificates;
- the production authorization-transaction store;
- an authenticated production deployment;
- a session cleanup schedule;
- final production session lifetime/idle-timeout policy;
- final production logout/provider-logout behavior;
- production audit/SIEM delivery; or
- production Cloudflare resource provisioning.

Those remain later explicitly reviewed production decisions.

## Revisit criteria

Revisit this ADR if:

- D1 cannot meet an approved authenticated-session availability or revocation requirement;
- a multi-region/session architecture requires a different authoritative consistency model;
- a live provider requires materially different session semantics;
- cryptographic guidance changes for high-entropy bearer-verifier storage; or
- a new store can be shown to preserve immediate authoritative revocation, verifier-only persistence,
  atomic rotation, and fail-closed behavior without weakening the authorization chain.
