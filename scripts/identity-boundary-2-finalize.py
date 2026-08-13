from pathlib import Path

MARKER = "## Production Identity & Tenant Boundary II — OIDC security and durable sessions"

sections = {
    "docs/IDENTITY_AUTHORIZATION_BOUNDARY.md": r'''
## Production Identity & Tenant Boundary II — OIDC security and durable sessions

Boundary II adds the non-live protocol and persistence architecture between a future standards-based
OIDC provider and the provider-neutral authentication boundary established in Boundary I. It does not
enable a live provider or production login.

### OIDC authorization-code boundary

The supported protocol contract is Authorization Code flow with PKCE. `OidcAuthorizationService`
creates a short-lived server-side authorization transaction, emits cryptographically random `state`
and OIDC `nonce`, creates an S256 PKCE verifier/challenge pair, and builds the provider authorization
request from a preconfigured provider record. Implicit flow is not supported.

The callback transaction stores only the opaque transaction identifier, provider identifier,
SHA-256 state verifier, SHA-256 nonce verifier, server-side PKCE verifier, bounded same-application
return target, timestamps, and one-time consumed state. Transactions expire within at most ten
minutes, are consumed before authorization-code exchange, and cannot be replayed. The permanent
adapter in this release is intentionally in-memory/local only; a live or distributed deployment must
select an appropriate server-side transaction store before activation.

Return targets must be relative `/app...` paths. Absolute URLs, scheme-relative targets, backslash
variants, and paths outside the authenticated application boundary are rejected. Provider state never
carries an arbitrary redirect URL.

### Signed ID-token validation

`WebCryptoOidcIdTokenValidator` validates only after the callback transaction selects the configured
provider. Provider configuration supplies the exact allowed issuer, expected client/audience, and
already-trusted public JWK material. This release accepts only RS256 synthetic assertions and delegates
signature verification to platform Web Crypto; it does not implement a signature algorithm or accept
unsigned/`none` assertions.

After signature verification, the validator requires exact issuer, expected audience (and `azp` for
multi-audience assertions), valid expiration, optional not-before, bounded/fresh issued-at, immutable
subject, and the expected nonce verifier. Email/name claims remain presentation-only metadata and do
not grant application authority. Raw ID/access/refresh tokens are not placed in the normalized
principal or authorization request.

The permanent test suite generates ephemeral RSA signing keys at test runtime and needs no provider
network access or repository-stored private key. No live JWKS fetch or key-rotation mechanism is
selected by this release.

### Durable bearer/verifier session model

Boundary II replaces the local raw-session-store contract with a split credential model:

`256-bit browser bearer token -> domain-separated SHA-256 verifier -> authoritative D1 session row`

Only the browser/session-delivery boundary receives the raw bearer. `SessionStore` receives and looks
up the 64-lowercase-hex verifier. D1 therefore does not persist a directly usable session cookie.
Session security events contain neither raw bearer nor verifier.

`DatabaseSessionStore` is the accepted initial durable session implementation under ADR 0003. The
D1 row is authoritative for existence, subject binding, expiry, and explicit revocation. Rotation is
one D1 transactional batch: the old row is conditionally revoked and bound to the exact replacement
verifier, then the replacement is inserted only for that winning rotation. A verifier collision fails
the batch rather than leaving a partially rotated credential.

Expiry/revocation is checked on every lookup. Cleanup may remove expired or revoked rows later, but
cleanup timing never extends validity and no KV/cache/TTL state becomes authentication truth.

A structurally valid session still grants no Document Control permission by itself. Current active
membership, role binding, permission, and tenant/workspace/resource scope remain live application
authorization checks.

### Cookie, callback, and CSRF posture

The OIDC authorization-transaction cookie carries only the opaque transaction identifier and is
`HttpOnly`, `SameSite=Lax`, bounded to the short transaction lifetime, `Secure` under HTTPS, and
scoped to `/auth/oidc/callback`.

The authenticated bearer cookie is separate (`ldw_authenticated_session`), `HttpOnly`,
`SameSite=Lax`, bounded to the session lifetime, `Secure` under HTTPS, and scoped to `/app`. The
synthetic demo cookie remains a third, separate credential and cannot authenticate the production-style
middleware. Logout revokes the authoritative verifier and clears the authenticated cookie.

`SameSite=Lax` is selected for the top-level authorization redirect model; it does not weaken ordinary
same-origin mutation CSRF controls. Authenticated mutation routes must preserve the existing
same-origin/CSRF protections independently of login redirects.

### Failure and audit behavior

Signature, issuer, audience, time, subject, state, nonce, PKCE, replay, transaction-expiry, internal
identity mapping, membership, role, tenant, and session failures fail closed. External authentication
failures are intentionally bounded and do not expose claims, tokens, verifier values, tenant existence,
or provider internals.

OIDC security events are minimized to authentication success or rejection, provider identifier where
known, bounded reason code, and timestamp. Session security events remain established/revoked/rotated
plus internal subject and timestamp. Authorization codes, access/ID/refresh tokens, raw bearer tokens,
session verifiers, state, nonce, PKCE verifier, private keys, and client credentials are forbidden from
these audit models.

### Remaining live-provider decisions

Before controlled authenticated staging, separately approve the actual provider/application
registration, discovery/JWKS trust and key-rotation model, issuer/client/redirect configuration,
provider credentials if any, production authorization-transaction persistence, provider logout and
disabled-user behavior, final session/idle policy, MFA/Conditional Access expectations, tenant
provisioning, SCIM/JIT/group mapping/deprovisioning, break-glass administration, production audit and
monitoring, and deployment/resource ownership. No such live integration is enabled by Boundary II.
''',
    "docs/ARCHITECTURE.md": r'''
## Production Identity & Tenant Boundary II — OIDC security and durable sessions

Boundary II adds protocol and persistence infrastructure behind the provider-neutral identity boundary
without registering a live authentication route in the production Worker composition.

The authentication architecture is now:

`OIDC Authorization Code + state/nonce/PKCE -> signed assertion validation -> AuthenticatedPrincipal -> application identity mapping -> bearer/verifier session -> live tenant membership -> live role/permission -> resource scope`

OIDC-specific protocol objects remain outside domain/application authorization. Provider claims cannot
directly become roles or permissions.

### OIDC components

- `src/application/oidc.ts` owns provider-neutral OIDC authorization transaction, code-exchange,
  validation, return-target, and bounded security-event contracts.
- `src/infrastructure/webcrypto-oidc-security.ts` owns platform-random state/nonce/PKCE generation and
  SHA-256 operations.
- `src/infrastructure/webcrypto-oidc-id-token-validator.ts` performs provider-bound RS256 verification
  against configured trusted public JWK material and validates issuer/audience/time/subject/nonce.
- `src/http/oidc.ts` owns the narrow transaction-cookie/callback extraction boundary.
- `src/local-auth/in-memory-oidc-authorization-transaction-store.ts` is deliberately local/test-only.

A future live provider adapter must supply authorization-code exchange and trusted key configuration;
this release provides no network provider client, discovery client, app registration, or credential.

### Durable session persistence

ADR 0003 accepts D1/SQLite as the initial authoritative authenticated-session state architecture.
Migration `0012_authenticated_session_verifiers.sql` adds `authenticated_sessions`, keyed by a
SHA-256 verifier rather than the raw 256-bit browser bearer token. The table stores internal subject,
authentication/creation/expiry timestamps, revocation, and a verifier-only rotation marker.

`DatabaseSessionStore` uses authoritative D1 reads and writes. Rotation relies on transactional D1
batch semantics so conditional old-session revocation and replacement insertion succeed or roll back
together. No KV/cache/index is session or authorization truth. Cleanup indexes optimize eventual
storage hygiene only; expiry/revocation checks determine validity.

The HTTP middleware still receives only an opaque browser bearer and only emits normalized internal
subject/session timestamps to request context. Authorization remains in existing authorized
application facades and `DatabaseAuthorizationPolicy`.

### Composition boundary

The permanent Worker application does not register live OIDC start/callback routes in this release.
A test-only Hono composition proves the future path end-to-end using synthetic cryptography and the
real application/D1 authorization adapters. `/demo` remains unchanged and isolated.

No runtime dependency, Cloudflare resource, production secret, customer data path, or paid service is
introduced.
''',
    "docs/THREAT_MODEL.md": r'''
## Production Identity & Tenant Boundary II — OIDC/session threat controls

Boundary II implements non-live controls for the authentication threats that were previously future
production gates. These controls are architecture/test evidence, not a claim that a live identity
provider or production login is enabled.

### OIDC protocol threats

| Threat | Boundary II control |
| --- | --- |
| forged/unsigned assertion | only configured RS256 is accepted; signature is verified with platform Web Crypto against trusted configured public JWK material before claims are trusted |
| issuer confusion | callback transaction selects a known provider and exact issuer equality is required |
| token substitution/wrong client | expected audience/client is required; multi-audience assertions require matching `azp` |
| stale/future assertion | `exp`, optional `nbf`, and bounded/fresh `iat` are validated fail-closed |
| identity alias/email takeover | immutable `sub` maps through the existing application-owned issuer+subject identity mapping; email/name are non-authoritative |
| login CSRF | cryptographic state is stored as a server-side verifier and must match the callback |
| token replay/cross-login substitution | OIDC nonce is bound to the authorization transaction and validated after signature verification |
| authorization-code interception | PKCE S256 challenge/verifier is mandatory in the contract; implicit flow is not supported |
| callback replay | authorization transaction is short-lived and one-time; it is consumed before code exchange |
| open redirect | only bounded same-application relative `/app...` return targets are accepted |
| protocol-secret disclosure | transaction/audit models exclude authorization code, tokens, raw state/nonce, session bearer/verifier, private signing key, and client credential |

### Durable-session threats

| Threat | Boundary II control |
| --- | --- |
| D1 disclosure yields usable cookie | raw 256-bit bearer is never persisted; D1 stores only a domain-separated SHA-256 verifier |
| session fixation/reuse | authentication issues an independent opaque bearer; rotation invalidates the prior verifier without extending original expiry |
| concurrent/partial rotation | D1 transactional batch binds the winning old-session revoke to the exact replacement verifier; collision rolls back |
| revoked session survives cleanup delay | revocation is authoritative row state checked at lookup; cleanup timing is irrelevant to validity |
| expired session survives cleanup delay | expiry is checked at lookup; cleanup is storage hygiene only |
| cache consistency bypass | no KV/cache/secondary index is accepted as authentication truth |
| session grants stale authorization | tenant membership, role bindings, permission, and scope remain live authorization checks after authentication |
| demo credential crosses trust boundary | `ldw_guided_demo_session` remains distinct and cannot satisfy `ldw_authenticated_session` middleware |

### Residual live-provider threats and gates

A live deployment still requires explicit review of provider registration ownership, discovery/JWKS
retrieval and signing-key rotation, redirect URI control, provider/client credentials, production
transaction-state persistence, MFA/Conditional Access expectations, provider logout/disabled-user
revocation, tenant provisioning and deprovisioning, break-glass access, audit/monitoring, deployment
secrets, and controlled staging. Boundary II does not lower any customer-data, upload, malware,
retention/legal-hold, recovery, or deployment gate.
''',
    "docs/OPERATIONS_RECOVERY.md": r'''
## Production Identity & Tenant Boundary II — session operations and recovery

Migration `0012_authenticated_session_verifiers.sql` adds security-sensitive authenticated-session
metadata to the accepted D1/SQLite state architecture. The table stores verifier digests, internal
subject references, timestamps, revocation state, and verifier-only rotation linkage. It does **not**
store raw browser bearer tokens.

### Session validity versus cleanup

Operational cleanup must never be used as an authentication mechanism. A row is invalid immediately
when revoked or expired even when it remains physically present. Cleanup may later delete:

- rows whose `expires_at` is at or before the cleanup cutoff; and
- revoked rows whose `revoked_at` is at or before the cleanup cutoff.

No cleanup schedule is selected by this release. A delayed cleanup job may increase stored-row count
but must not extend access.

### Rotation and failure handling

D1 rotation is a transactional batch. The first statement conditionally revokes the active old
verifier and records the exact intended replacement verifier. The second inserts the replacement only
when that marker matches. D1 transaction rollback is required so duplicate/collision failure cannot
leave a partially revoked old credential.

If session persistence is unavailable, authentication fails closed rather than falling back to a KV,
cache, browser claim, or stale replica as authoritative truth.

### Backup and restore

Authenticated sessions are credentials, not business records. Recovery must recreate the current
`authenticated_sessions` schema, but stale restored session rows should not be treated as durable
business state to preserve. The preferred production recovery posture is to invalidate recovered
session rows and require reauthentication after a D1 restore/disaster-recovery event unless a later
approved design proves fresher authoritative revocation state.

Never copy raw bearer tokens, authorization codes, ID/access/refresh tokens, state, nonce, PKCE
verifier, provider private keys, or client credentials into backup evidence, recovery logs, or portable
application exports. The portable business-data export remains separate from authenticated-session
state.

A post-restore application check must verify that protected requests fail closed when no valid current
session exists and that live membership/role authorization still applies after reauthentication.

### Migration assurance

The supported migration assurance advances to:

- empty supported database -> all ordered migrations through `0012`; and
- immediately prior supported schema `0011` -> apply `0012` -> current schema.

The upgrade test preserves representative tenant/document/audit records and prior invariants while
also proving the verifier-only schema accepts a valid fixed verifier and rejects a raw/non-verifier
identifier. Released migrations remain immutable and forward-only.
''',
    "docs/STATUS.md": r'''
## Production Identity & Tenant Boundary II — OIDC Security & Durable Session Architecture

Authorized from exact base `137bd2658763c12be36dfb385c6c3f4aecdb3c68` on branch
`release/production-identity-tenant-boundary-2`.

Implemented production-readiness architecture:

- Authorization Code OIDC contracts with cryptographic state, nonce, mandatory PKCE S256, bounded
  same-application return target, short server-side callback transaction state, one-time consumption,
  and replay denial;
- provider-bound signed ID-token validation using platform Web Crypto, exact issuer/client audience,
  immutable subject, expiration/not-before/issued-at, nonce, and trusted configured public JWK material;
- runtime-generated synthetic RSA fixtures with no provider network call or repository-stored private key;
- revised session contract that returns a 256-bit bearer only to the client boundary while persisting
  only a domain-separated SHA-256 verifier;
- D1/SQLite authoritative durable session store with immediate expiry/revocation semantics,
  transactional verifier-bound rotation, collision rollback, and non-authoritative asynchronous cleanup;
- migration `0012_authenticated_session_verifiers.sql` plus clean-create and `0011 -> 0012` upgrade
  assurance;
- ADR 0003 accepting verifier-only D1 durable session state;
- OIDC transaction and authenticated-session cookies with bounded paths/lifetimes, HttpOnly,
  `SameSite=Lax`, HTTPS `Secure`, logout clearing, and no OIDC token material;
- test-only authenticated Hono composition proving signed OIDC -> internal mapping -> durable session ->
  authentication middleware -> live tenant membership -> live role permission, including tenant
  crossing, suspension, role-removal, unknown-mapping, demo-cookie, and logout denial cases.

The permanent Worker remains non-live: no OIDC start/callback route is registered in normal
`src/http/app.ts`, no production authorization-transaction store or provider client is selected, and no
live provider, app registration, production credential, Cloudflare resource, customer data, PHI,
upload path, or paid service is introduced. Expected new recurring cost remains `$0`.

Exact frozen-head CI evidence is recorded in PR #43 after final validation; this status section does
not substitute for that exact-head PR evidence.
''',
    "docs/HANDOFF.md": r'''
## Production Identity & Tenant Boundary II handoff

Repository: `LowcountryDigitalWorks/document-control`

Authorized base: `137bd2658763c12be36dfb385c6c3f4aecdb3c68`

Branch: `release/production-identity-tenant-boundary-2`

Draft PR: `#43 — Production Identity & Tenant Boundary II — OIDC Security & Durable Session Architecture`

### Work completed

- Added Authorization Code OIDC security contracts, short-lived one-time callback transactions,
  state/nonce verifier handling, PKCE S256, bounded return targets, and minimized security-event types.
- Added platform Web Crypto state/nonce/PKCE/digest primitives and provider-bound RS256 ID-token
  validation against trusted configured public JWK material.
- Revised the session boundary so raw browser bearer tokens never reach durable storage; D1 stores
  only domain-separated SHA-256 verifier digests.
- Added `DatabaseSessionStore`, transactional replacement-verifier-bound rotation, immediate
  revocation/expiry denial, and cleanup that is explicitly non-authoritative for validity.
- Added migration `0012_authenticated_session_verifiers.sql` and upgraded migration tests through
  clean `0012` plus `0011 -> 0012`.
- Added ADR `docs/adr/0003-d1-verifier-only-durable-session-state.md`.
- Added bounded OIDC transaction-cookie helpers and updated the production-style authenticated cookie
  to `Path=/app`, `SameSite=Lax`, HttpOnly, bounded lifetime, HTTPS Secure, and matching logout clear.
- Added deterministic/no-network synthetic cryptographic tests and a test-only full authenticated route
  composition through current membership and permission authorization.

### Architectural decisions

- D1/SQLite is the initial authoritative durable session-state store.
- The browser credential is 256-bit opaque random bearer material; the durable lookup key is a
  domain-separated SHA-256 verifier. No password-hashing semantics are added for this high-entropy
  secret.
- D1 transactional batch semantics are required for rotation; KV/cache/index state is not
  authentication truth.
- OIDC provider assertions remain outside application authorization. Claims normalize only to
  `AuthenticatedPrincipal`; current internal membership/role/permission/scope remains authoritative.
- The permanent test validator accepts only RS256 against configured public JWKs and uses Web Crypto;
  no custom signature algorithm or new JWT/OIDC dependency was added.
- Authorization transaction state remains local/in-memory for this non-live release; production
  persistence is a future staging decision.

### Assumptions and boundaries

- No live Microsoft Entra, Google, Okta, Auth0, or other provider is contacted.
- No production app registration, client secret, certificate, signing private key, Cloudflare resource,
  session cleanup schedule, provider discovery/JWKS network client, or live login route is created.
- `/demo` remains synthetic and isolated.
- Existing mutation CSRF/same-origin protections remain authoritative; `SameSite=Lax` for login redirect
  cookies does not replace them.
- Expected new recurring cost is `$0`.

### Unresolved next-stage work

Before controlled authenticated staging, explicitly decide and review:

- actual provider/application registration and ownership;
- discovery/JWKS retrieval, cache/freshness, signing-key rollover, issuer/audience configuration, and
  redirect URI control;
- production authorization-code exchange client and provider credential management if required;
- durable/distributed production authorization-transaction state;
- provider logout, disabled-user/session-revocation behavior, final idle/absolute session policy, and
  cleanup schedule;
- MFA/Conditional Access expectations;
- tenant provisioning, SCIM/JIT/group mapping/deprovisioning;
- break-glass/platform administration;
- production audit/monitoring/SIEM behavior; and
- controlled authenticated staging and recovery validation.

### Recommended next action

The authoritative orchestrator should review PR #43 at its final frozen head and exact normal CI
results. This specialist workstream must not merge it. No production identity-provider configuration
or Cloudflare provisioning should begin solely from this handoff.
''',
}

for filename, section in sections.items():
    path = Path(filename)
    text = path.read_text(encoding="utf-8")
    if MARKER in text and filename != "docs/HANDOFF.md":
        continue
    if filename == "docs/HANDOFF.md" and "## Production Identity & Tenant Boundary II handoff" in text:
        continue
    path.write_text(text.rstrip() + "\n\n" + section.strip() + "\n", encoding="utf-8")
