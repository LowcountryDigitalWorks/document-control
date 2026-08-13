from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement target, found {count}")
    target.write_text(text.replace(old, new, 1))


def insert_before(path: str, marker: str, addition: str) -> None:
    target = Path(path)
    text = target.read_text()
    if marker not in text:
        raise SystemExit(f"{path}: marker not found: {marker}")
    target.write_text(text.replace(marker, addition.strip() + "\n\n" + marker, 1))


def append_section(path: str, addition: str) -> None:
    target = Path(path)
    text = target.read_text().rstrip()
    heading = addition.strip().splitlines()[0]
    if heading in text:
        raise SystemExit(f"{path}: section already present: {heading}")
    target.write_text(text + "\n\n" + addition.strip() + "\n")


replace_once(
    "docs/ARCHITECTURE.md",
    "Production authentication/SSO/session management is not implemented by this release.\nSee `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md`.",
    "Provider-neutral authenticated-principal, identity-mapping, session, and tenant-context contracts now exist, but no live identity provider, production session store, or authenticated production route is connected. See `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md`.",
)
insert_before(
    "docs/ARCHITECTURE.md",
    "## Controlled templates",
    """## Production authentication and tenant-context boundary

Production Identity & Tenant Boundary I inserts authentication ahead of tenant-scoped authorization without changing who grants authority:

```text
validated provider assertion (future provider adapter)
  -> AuthenticatedPrincipal (provider + exact issuer + immutable subject)
  -> application-owned identity_subject mapping
  -> opaque authenticated session
  -> HTTP authentication middleware
  -> active tenant/workspace context
  -> existing authorized application service
  -> live membership + role binding + permission + resource scope
```

`AuthenticatedPrincipal` contains no access token, refresh token, ID token, password, MFA material, or browser authority. Email/display name are optional bounded presentation metadata only. External mapping uses the existing `(provider, provider_subject)` uniqueness, where `provider_subject` is a canonical JSON tuple of exact issuer plus immutable external subject. Unknown mappings fail closed.

`SessionService` owns provider-neutral lifetime, lookup, expiry, explicit revocation/logout, and rotation through injectable ports. `CryptoSessionIdGenerator` produces 256-bit opaque random identifiers. The only session-store implementation supplied in this release is `src/local-auth/in-memory-session-store.ts`, an isolated local/test adapter that is not wired into the Worker.

`DatabaseTenantContextResolver` requires active application membership and verifies workspace ownership inside the selected tenant. Browser tenant/workspace values remain selectors, not authority. Permission decisions stay in `DatabaseAuthorizationPolicy` and authorized application facades, which re-read current membership and role state for every protected operation.

`src/http/authentication.ts` provides bounded middleware for future protected routes. It resolves only the opaque session reference and places only normalized internal subject/session timestamps into request context. Missing, expired, or revoked state receives the same bounded 401 response. The middleware is intentionally not registered in `src/http/app.ts` because no live provider or production session store is present.

The `/demo` application remains structurally separate with its own `ldw_guided_demo_session` namespace, synthetic identities, and `/demo` cookie path. The demo cookie cannot satisfy the authenticated-session parser and `src/local-auth` is not imported by normal Worker composition.
""",
)

replace_once(
    "docs/IDENTITY_AUTHORIZATION_BOUNDARY.md",
    "This document does not select or configure a production identity provider, create an Entra\napplication registration, connect Active Directory, enable SSO, implement SCIM/group sync, or add\nproduction credentials. Production login sessions and production tenant provisioning are also not\nimplemented. Those remain future deployment decisions with separate security, rollback, ownership,\nand validation review.",
    "This document does not select or configure a production identity provider, create an Entra\napplication registration, connect Active Directory, enable SSO, implement SCIM/group sync, or add\nproduction credentials. Production Identity & Tenant Boundary I now provides provider-neutral\nauthenticated-principal, identity-mapping, session, tenant-context, and HTTP authentication contracts\nplus deterministic local/test adapters. No live provider, production session store, authenticated\nproduction route, or production tenant-provisioning flow is implemented. Those remain future\ndeployment decisions with separate security, rollback, ownership, and validation review.",
)
append_section(
    "docs/IDENTITY_AUTHORIZATION_BOUNDARY.md",
    """## Production Identity & Tenant Boundary I — implemented contracts

### Authenticated principal and mapping

A successfully validated future provider adapter must emit `AuthenticatedPrincipal` with only provider family, exact issuer, immutable external subject, authenticated-at timestamp, and optional bounded email/display-name presentation metadata. Email, domain, display name, external group name, and provider role label never grant Document Control authority.

External identity maps to `identity_subjects` as `provider + canonical JSON([issuer, immutable subject])`. Provider remains the existing schema column and the canonical tuple is stored in `provider_subject` for provisioned external identities. The existing unique `(provider, provider_subject)` constraint is sufficient, so this release adds no migration. Unknown mappings fail closed and there is no JIT or email-domain auto-enrollment.

Raw access/refresh/ID tokens, passwords, MFA material, private keys, client secrets, unrestricted claim payloads, and cookies are excluded from the principal, application authorization request, and session security-event contract.

### Session core

`SessionService` is independent of a specific IdP and production session technology. A session contains a 256-bit opaque identifier, internal `subjectId`, authentication timestamp, creation timestamp, and expiry; revocation remains server-side store state. The service enforces a bounded lifetime, expiry, explicit revoke/logout, and rotation that invalidates the old identifier without extending its original expiry.

`CryptoSessionIdGenerator` uses platform cryptographic randomness. `SessionStore` is injectable. `InMemorySessionStore` and `DeterministicIdentityAdapter` live under `src/local-auth/` and are local/test-only; no fake username/password login or production session store is created.

Session security events are minimized to established/revoked/rotated, internal subject ID, and timestamp. A production audit sink is not selected in this release and the event contract excludes session IDs, cookies, emails, provider claims, and credentials.

### Tenant context and live authorization

For tenant-scoped routes, browser tenant/workspace values are selectors only. `DatabaseTenantContextResolver` requires the normalized internal subject to have active membership and verifies that a workspace belongs to the selected tenant. Failure is generic and does not reveal another tenant's object existence.

Tenant-context resolution does not grant permission. Existing authorized application services and `DatabaseAuthorizationPolicy` remain the authorization boundary, so active membership and current role bindings are re-read on each protected operation. A valid opaque session therefore does not preserve authority after membership suspension or role removal.

### HTTP cookie and CSRF posture

`src/http/authentication.ts` resolves the separate `ldw_authenticated_session` cookie and passes only normalized internal subject/session timestamps into Hono context. Missing, malformed, expired, or revoked sessions return the same `401 Authentication required.` response.

Local/test cookie delivery is HttpOnly, Secure on HTTPS, explicitly time-bounded, `SameSite=Strict`, and currently `Path=/`. The exact production cookie path and SameSite/redirect policy must be re-reviewed with the actual OIDC/SAML/Entra callback model. Existing same-origin mutation protection and global CSP/security headers remain unchanged; future authenticated mutations must preserve CSRF protection.

### Synthetic demo isolation and unresolved provider work

The `/demo` experience keeps its own `ldw_guided_demo_session` cookie, synthetic identities, and server-derived synthetic tenant/workspace context. The new authentication middleware is not registered in `src/http/app.ts` and the demo cookie is not accepted as a production-authenticated session.

Before live production identity, separately select and validate provider/protocol, signature/issuer/audience/state/nonce checks, app registration/redirect ownership, production session storage, provider logout/revocation, provider/client credentials, MFA/conditional access, provisioning/SCIM/group mapping and deprovisioning, production cookie/CSRF redirect semantics, break-glass administration, monitoring, and audit sink behavior.
""",
)

replace_once(
    "docs/THREAT_MODEL.md",
    "The repository remains pre-production. Product-shaped interactive routes are synthetic/test-only.\nProduction authentication, tenant provisioning, customer uploads, malware scanning/quarantine,\nretention/legal hold, complete production backup/recovery, production Cloudflare resources, customer\ndata, and PHI are not implemented or authorized by this baseline.",
    "The repository remains pre-production. Product-shaped interactive routes are synthetic/test-only.\nProduction Identity & Tenant Boundary I adds provider-neutral authentication/session contracts and\ndeterministic local/test adapters, but no live identity provider, production session store, or\nauthenticated production application route is connected. Tenant provisioning, customer uploads,\nmalware scanning/quarantine, retention/legal hold, complete production backup/recovery, production\nCloudflare resources, customer data, and PHI remain unimplemented and unauthorized.",
)
replace_once(
    "docs/THREAT_MODEL.md",
    "Future/residual: Production Identity & Tenant Boundary must establish authenticated tenant context,\nconsistent production error mapping, and hostile cross-tenant route tests. Tenant provisioning and\nreal authenticated routing are not implemented.",
    "Current: Production Identity & Tenant Boundary I adds normalized authenticated context plus\n`DatabaseTenantContextResolver`, which requires active membership and verifies workspace ownership\ninside the selected tenant. Browser tenant/workspace IDs are selectors only and denial is generic.\n\nFuture/residual: wire this boundary only after a real provider and production session store are\napproved, then add end-to-end hostile-ID tests against authenticated production-shaped routes. Tenant\nprovisioning and live authenticated routing remain unimplemented.",
)
replace_once(
    "docs/THREAT_MODEL.md",
    "Future/residual: production adapters must validate provider assertions and map immutable provider\nsubjects/groups to internal membership/role state with default-deny behavior. JIT/SCIM/group mapping\nand deprovisioning remain undecided.",
    "Current: provider-neutral principal normalization requires provider + exact issuer + immutable\nexternal subject. `IdentityMappingService` maps only that canonical identity to an application-owned\nsubject and unknown mappings fail closed; email/display metadata cannot grant authority.\n\nFuture/residual: the real provider adapter must validate signatures, issuer/audience, state/nonce and\nother protocol requirements before emitting `AuthenticatedPrincipal`. JIT/SCIM/group mapping,\nprovider deprovisioning, and group ownership remain undecided.",
)
replace_once(
    "docs/THREAT_MODEL.md",
    "Future/residual: production session rotation, lifetime/revocation, authentication binding, CSRF\nstrategy, and IdP redirect behavior must be designed and tested. Synthetic cookies are not production\nsessions.",
    "Current: provider-neutral `SessionService` enforces opaque 256-bit IDs, bounded lifetime, expiry,\nrevocation/logout, and rotation that invalidates the prior ID without extending expiry. HTTP\nmiddleware accepts only the separate authenticated-session cookie and passes normalized internal\ncontext; the demo cookie remains isolated.\n\nFuture/residual: select a production session store and real IdP binding; validate provider logout and\nserver-side cleanup; finalize cookie/SameSite/CSRF behavior against the actual redirect flow; and test\nsession theft/replay/rotation behavior end to end.",
)
insert_before(
    "docs/THREAT_MODEL.md",
    "## Security gates before production capabilities",
    """## Production Identity & Tenant Boundary I implemented controls

- Provider-neutral principal normalization uses provider, exact issuer, immutable external subject, and authentication timestamp; optional email/display metadata cannot affect authority.
- Canonical external identity mapping resolves to an application-owned subject and unknown mappings fail closed. No JIT/email-domain enrollment is added.
- Opaque 256-bit session identifiers have explicit bounded lifetime, expiry, revocation/logout, and rotation semantics through an injectable store.
- Only isolated local/test identity and in-memory session adapters are supplied; there is no live provider or production session store.
- Session security events contain only type, internal subject ID, and timestamp.
- Authenticated tenant/workspace context requires current active membership and verifies workspace ownership.
- Existing authorized services continue to re-read role/permission state, so suspension or role removal takes effect despite a valid session.
- Bounded HTTP middleware returns one generic authentication failure and passes no provider claims/tokens into authorization.
- Conservative local/test cookie semantics coexist with unchanged same-origin/CSP/security-header protections.
- Tests mechanically keep the synthetic `/demo` session separate from the production-auth contract.

Residual production work includes live assertion validation, provider/client registration and credentials, production session storage, redirect/login/logout endpoints, MFA/conditional-access policy, provisioning/SCIM/group mapping, deprovisioning, final cookie/CSRF semantics, break-glass administration, monitoring/audit sink, and authenticated controlled staging.
""",
)
replace_once(
    "docs/THREAT_MODEL.md",
    "### Production Identity & Tenant Boundary\n\nMust establish production authentication/session semantics, authenticated tenant context,\nprovisioning/IdP normalization, revocation/deprovisioning, production CSRF/session controls, and\nhostile cross-tenant authorization tests before production user access.",
    "### Production Identity & Tenant Boundary I — authentication contracts established\n\nProvider-neutral principal normalization, fail-closed identity mapping, session lifecycle semantics,\nauthenticated tenant/workspace context, bounded HTTP middleware, isolated local/test adapters, and\nrevocation/cross-tenant tests are established. Live provider assertion validation, production session\nstorage, provider provisioning/deprovisioning, final redirect/cookie/CSRF semantics, and authenticated\ncontrolled staging remain future gates before production user access.",
)

insert_before(
    "docs/OPERATIONS_RECOVERY.md",
    "## Cost and implementation impact",
    """## Authentication/session operational boundary after Production Identity & Tenant Boundary I

External identity mappings now use existing D1 application state: `identity_subjects.provider` plus canonical issuer/immutable-subject data in `provider_subject`. Those mappings, memberships, and role bindings remain part of the D1 metadata/state recovery boundary.

Authenticated session state is deliberately not added to D1 or the portable export. `SessionStore` is an application port and the only supplied implementation is isolated local/test memory. A future production store must define availability, cleanup, revocation propagation, monitoring, and incident invalidation without turning provider tokens or session secrets into portable business records.

Production recovery must fail closed when session state is unavailable or untrusted. Do not recreate authenticated sessions from portable exports, audit records, email/display metadata, or provider claims. Depending on the eventual provider/store, forcing re-authentication after recovery may be safer than restoring ephemeral session state and must be decided explicitly.

Provider/client secrets, signing keys, access/refresh/ID tokens, MFA material, session identifiers/cookies, and recovery credentials remain excluded from repository docs, portable exports, and ordinary application audit data.
""",
)

replace_once(
    "docs/STATUS.md",
    "- Production authentication/SSO, production session management, or identity-provider integration.",
    "- Live production authentication/SSO or identity-provider integration; production session storage and provider login/logout wiring remain unselected. Provider-neutral authentication/session contracts now exist under Production Identity & Tenant Boundary I.",
)
append_section(
    "docs/STATUS.md",
    """### Production Identity & Tenant Boundary I — Authentication Contracts & Session Core

- Added a provider-neutral `AuthenticatedPrincipal` using provider, exact issuer, immutable external subject, authentication time, and optional bounded presentation metadata. Email/display name cannot grant authority and raw tokens/credentials/MFA material are absent.
- External identity maps to the existing application-owned `identity_subjects` record through `provider + canonical JSON([issuer, subject])`; unknown mappings fail closed. No JIT/email-domain enrollment is implemented and no migration is required.
- Added provider-neutral `SessionService` with 256-bit opaque IDs, bounded lifetime, expiry, explicit revoke/logout, and rotation that invalidates the old ID without extending expiry. The store, clock, ID generator, and minimized audit sink are ports.
- `CryptoSessionIdGenerator` uses cryptographic randomness. The only supplied session store and deterministic identity adapter are under `src/local-auth/` and remain local/test-only.
- `DatabaseTenantContextResolver` requires active membership and verifies tenant/workspace ownership. Existing authorized facades continue to evaluate current roles/permissions, so suspension or role removal immediately removes authority despite a valid session.
- Added bounded HTTP authentication middleware for future protected routes. It accepts only the separate opaque authenticated-session cookie and passes normalized internal context; it is intentionally not registered in `src/http/app.ts` yet.
- Local/test cookie semantics are HttpOnly, Secure on HTTPS, explicitly time-bounded, and SameSite=Strict. Existing same-origin mutation protection and global security headers/CSP remain unchanged; final redirect/cookie/CSRF policy awaits a real provider.
- Session security events are minimized to established/revoked/rotated plus internal subject and timestamp. No production audit sink is selected.
- The existing `/demo` experience remains separate with `ldw_guided_demo_session` and synthetic identities. It is not production authentication.
- No live Entra/OIDC/SAML provider, production credentials, production session store, SCIM/JIT, tenant provisioning, production Cloudflare resources, customer upload, customer data, PHI, PostgreSQL, or paid service is introduced. Expected recurring cost remains `$0`.
""",
)

append_section(
    "docs/HANDOFF.md",
    """## Production Identity & Tenant Boundary I — Authentication Contracts & Session Core boundary

- Preserve the chain: validated external principal -> application-owned identity subject -> active tenant membership -> internal role binding -> required permission -> tenant/workspace/resource scope. Provider identity never directly grants permission.
- `AuthenticatedPrincipal` contains provider, exact issuer, immutable external subject, authentication time, and optional bounded presentation metadata only. Never add raw tokens, passwords, MFA material, credentials, email-domain authority, display-name authority, or unrestricted claims.
- External identity uses the existing `(provider, provider_subject)` uniqueness with canonical JSON `[issuer, immutable subject]` stored as `provider_subject`. Unknown mappings fail closed; no JIT/SCIM/email-domain enrollment or schema migration exists in this slice.
- `SessionService` owns opaque 256-bit IDs, bounded lifetime, expiry, revoke/logout, and rotation through injected ports. `src/local-auth/` adapters are test/local only and must not be imported into normal Worker composition.
- `DatabaseTenantContextResolver` verifies active membership and workspace ownership. Browser tenant/workspace values are selectors only. Permission logic stays in existing authorized application services and `DatabaseAuthorizationPolicy`, preserving live suspension/role-removal behavior.
- `src/http/authentication.ts` is a future-route middleware building block, not a live login system. It accepts the separate `ldw_authenticated_session` cookie, emits one generic authentication failure, and passes normalized internal context. It is not registered in `src/http/app.ts` pending an approved live provider and production session store.
- Keep `/demo`, `ldw_guided_demo_session`, synthetic identities, and `DEMO_MUTATIONS_ENABLED` isolated from production authentication.
- Local/test cookie posture is HttpOnly, Secure on HTTPS, bounded Max-Age, SameSite=Strict, Path=/. Revisit redirect/SameSite/CSRF/logout semantics with the real provider without weakening ordinary same-origin mutation protection.
- Session security events contain only established/revoked/rotated, internal subject ID, and timestamp. No production audit sink is selected and no token/cookie/email claim/MFA/credential payload may be logged.
- Future live identity work still requires provider/protocol assertion validation, registration/redirect ownership, production session storage, provider logout/revocation, MFA/conditional access, provisioning/SCIM/group mapping/deprovisioning, break-glass administration, monitoring/audit sink, and authenticated controlled staging.
- No customer uploads, production Cloudflare resources, production tenant provisioning, retention/legal hold, customer data, PHI, PostgreSQL, analytics/tracking, or paid service is introduced. Expected recurring cost remains `$0`.
""",
)
