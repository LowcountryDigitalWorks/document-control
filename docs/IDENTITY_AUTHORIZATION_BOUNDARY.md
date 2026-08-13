# Identity and Authorization Boundary

## Purpose

Document Control keeps **authentication / identity source** separate from **application authorization**.
This lets a small customer use simple app-managed membership and roles while a larger deployment can
later use Microsoft Entra ID, an Active Directory-backed identity environment, OIDC, SAML, or another
provider without replacing the document-control permission model.

## Internal authorization model

Authorization remains application-owned:

1. an `identity_subject` represents a person or service identity;
2. a tenant membership determines whether that subject belongs to a tenant and whether membership is
   active;
3. role bindings associate the subject with application role definitions at the supported scope; and
4. role definitions contain the application permission set used by `AuthorizationPolicy`.

The schema already permits identity subjects whose provider is `local`, `oidc`, `saml`, `entra`, or
`external`. A provider identifier describes where identity came from; it does **not** grant application
permissions by itself.

## Small-customer deployment

A small deployment may use locally managed or otherwise directly provisioned members and assign
built-in or tenant-owned custom workspace roles in Document Control.

The application member lifecycle uses the existing membership states as **Staged / Active /
Suspended**. Staged is stored as `invited`, but it means pre-provisioned only in the current product;
no invitation email or credential is created by that action. Directly created members use the `local`
provider marker without storing passwords, MFA material, recovery codes, or tokens.

Suspension is application-owned and immediately removes authorization eligibility because the existing
policy requires active tenant membership. Role bindings remain intact so reactivation restores the
same internal role relationships and historical evidence is not deleted.

No external directory is required merely to use role-based access control.

## Enterprise / directory-backed deployment

A future enterprise identity adapter may authenticate and/or provision subjects from Microsoft Entra
ID, an Active Directory-connected identity service, OIDC, SAML, or another approved provider.

The preferred boundary is:

`external identity/group -> mapping/provisioning adapter -> identity subject + membership -> internal role binding -> application permission`

External directory groups should map to existing internal role definitions. Provider-specific group
IDs, names, claims, tokens, or credentials must not become the authorization model itself.

This keeps authorization portable and allows the same tenant role (for example, `Records
Coordinator`) to be assigned directly for a small customer or mapped from an Entra group for a larger
customer.

## Custom workspace roles

Tenant-owned custom workspace roles are intentionally provider-neutral. They may contain only the
bounded operational permission set exposed by the application.

The first custom-role administration slice intentionally excludes these grants:

- `*`;
- `tenant.manage`;
- `workspace.manage`; and
- `role.manage`.

This prevents a custom operational role from becoming an access-administration privilege-escalation
path. Built-in administrator roles remain the administrative authority.

Creating, editing, or retiring a tenant-owned custom role requires both tenant-level `tenant.manage`
and workspace-level `role.manage`. Assigning an existing eligible workspace role remains a workspace
`role.manage` operation.

Custom-role retirement is application-owned and provider-neutral. It is allowed only after every role
binding is removed, is terminal once recorded, preserves the definition for audit/export history, and
prevents later editing or assignment. Hard deletion is intentionally not part of the authorization
model.

## Future identity-provider requirements

Before production identity integration, explicitly decide and document:

- OIDC, SAML, Microsoft Entra ID, or other supported authentication protocols/providers;
- whether on-premises Active Directory is connected through Entra/ADFS/another IdP rather than direct
  LDAP-style application integration;
- production authentication and invitation-delivery behavior for app-local members;
- subject and group immutable identifiers;
- just-in-time provisioning versus pre-provisioning / SCIM-style synchronization;
- group-to-role mapping ownership and approval;
- deprovisioning, disabled-user, group-removal, and stale-session behavior;
- break-glass administration and recovery;
- MFA / conditional-access expectations at the identity provider;
- audit evidence for provisioning and mapping changes; and
- export/handoff behavior for provider mappings without exporting credentials or tokens.

## Security rules for future adapters

- Default deny when a subject or group mapping is unknown.
- Never infer administrator privileges from an untrusted display name or email domain.
- Use immutable provider subject/group identifiers for mappings.
- Never create or retain an external group mapping that targets a retired application role.
- Do not store passwords, MFA codes, refresh tokens, private keys, or provider client secrets in role
  definitions or portable exports.
- Preserve tenant boundaries even when the external directory spans multiple business units.
- Provider/group removal must not silently leave stale privileged application bindings.
- Access-administration events must remain auditable.

## Production identity gate

Production authentication remains a later gate after Production Readiness Foundation I and the
Operations & Supply-Chain Foundation. Before production access is enabled, the **Production Identity
& Tenant Boundary** must address the identity-related threats recorded in
[`THREAT_MODEL.md`](THREAT_MODEL.md), including malicious/compromised IdP claims, confused-deputy
mapping, session theft/fixation, CSRF, stale authorization after suspension/revocation, administrator
compromise, authenticated tenant context, and cross-tenant hostile-ID testing.

A future provider must still terminate in the application-owned authorization chain documented here;
no IdP choice authorizes direct provider-group-to-permission behavior.

## Current non-goals

This document does not select or configure a production identity provider, create an Entra
application registration, connect Active Directory, enable SSO, implement SCIM/group sync, or add
production credentials. Production Identity & Tenant Boundary I now provides provider-neutral
authenticated-principal, identity-mapping, session, tenant-context, and HTTP authentication contracts
plus deterministic local/test adapters. No live provider, production session store, authenticated
production route, or production tenant-provisioning flow is implemented. Those remain future
deployment decisions with separate security, rollback, ownership, and validation review.

## Production Identity & Tenant Boundary I — implemented contracts

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
