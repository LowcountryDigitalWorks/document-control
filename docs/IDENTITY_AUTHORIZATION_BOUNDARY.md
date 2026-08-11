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

Creating or editing a tenant-owned custom role requires both tenant-level `tenant.manage` and
workspace-level `role.manage`. Assigning an existing eligible workspace role remains a workspace
`role.manage` operation.

## Future identity-provider requirements

Before production identity integration, explicitly decide and document:

- OIDC, SAML, Microsoft Entra ID, or other supported authentication protocols/providers;
- whether on-premises Active Directory is connected through Entra/ADFS/another IdP rather than direct
  LDAP-style application integration;
- invited/local-account behavior for customers without an enterprise IdP;
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
- Do not store passwords, MFA codes, refresh tokens, private keys, or provider client secrets in role
  definitions or portable exports.
- Preserve tenant boundaries even when the external directory spans multiple business units.
- Provider/group removal must not silently leave stale privileged application bindings.
- Access-administration events must remain auditable.

## Current non-goals

This document does not select or configure a production identity provider, create an Entra
application registration, connect Active Directory, enable SSO, implement SCIM/group sync, or add
production credentials. Those remain future deployment decisions with separate security, rollback,
and ownership review.
