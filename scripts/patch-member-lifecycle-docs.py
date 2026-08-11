from pathlib import Path

readme_path = Path("README.md")
readme = readme_path.read_text()
readme = readme.replace(
    "- tenant presentation settings, workspace Roles & Access, and tenant-owned custom workspace roles;",
    "- tenant presentation settings, provider-neutral tenant member lifecycle, workspace Roles & Access, and tenant-owned custom workspace roles;",
    1,
)
identity_marker = '''The application schema already recognizes `local`, `oidc`, `saml`, `entra`, and `external` identity
providers. Provider identity describes **where an identity came from**; it does not grant application
permissions by itself.
'''
identity_addition = identity_marker + '''
The tenant member administration surface uses the existing membership states as **Staged / Active /
Suspended**. The stored Staged value remains `invited`, but this slice does not send invitation email.
Directly provisioned members use the `local` provider marker without storing passwords or other
credentials. Suspending any member makes the existing active-membership authorization check fail while
preserving role bindings and audit/history references.
'''
if identity_marker not in readme:
    raise SystemExit("README identity marker missing")
readme = readme.replace(identity_marker, identity_addition, 1)
readme = readme.replace(
    "Production authentication/SSO, directory/group synchronization, customer uploads, production",
    "Production authentication/SSO, invitation delivery, external identity provisioning/directory/group synchronization, customer uploads, production",
    1,
)
readme_path.write_text(readme)

boundary_path = Path("docs/IDENTITY_AUTHORIZATION_BOUNDARY.md")
boundary = boundary_path.read_text()
small_marker = '''A small deployment may use locally managed or otherwise directly provisioned members and assign
built-in or tenant-owned custom workspace roles in Document Control.

No external directory is required merely to use role-based access control.
'''
small_replacement = '''A small deployment may use locally managed or otherwise directly provisioned members and assign
built-in or tenant-owned custom workspace roles in Document Control.

The application member lifecycle uses the existing membership states as **Staged / Active /
Suspended**. Staged is stored as `invited`, but it means pre-provisioned only in the current product;
no invitation email or credential is created by that action. Directly created members use the `local`
provider marker without storing passwords, MFA material, recovery codes, or tokens.

Suspension is application-owned and immediately removes authorization eligibility because the existing
policy requires active tenant membership. Role bindings remain intact so reactivation restores the
same internal role relationships and historical evidence is not deleted.

No external directory is required merely to use role-based access control.
'''
if small_marker not in boundary:
    raise SystemExit("identity boundary small-customer marker missing")
boundary = boundary.replace(small_marker, small_replacement, 1)
future_marker = '''- invited/local-account behavior for customers without an enterprise IdP;
- subject and group immutable identifiers;'''
future_replacement = '''- production authentication and invitation-delivery behavior for app-local members;
- subject and group immutable identifiers;'''
if future_marker not in boundary:
    raise SystemExit("identity boundary future marker missing")
boundary = boundary.replace(future_marker, future_replacement, 1)
boundary_path.write_text(boundary)

handoff_path = Path("docs/HANDOFF.md")
handoff = handoff_path.read_text()
implemented_marker = '''- tenant presentation administration;
- workspace Roles & Access assignment administration;'''
implemented_replacement = '''- tenant presentation administration;
- provider-neutral tenant member administration with direct app-local provisioning and Staged / Active /
  Suspended membership lifecycle;
- workspace Roles & Access assignment administration;'''
if implemented_marker not in handoff:
    raise SystemExit("handoff implemented marker missing")
handoff = handoff.replace(implemented_marker, implemented_replacement, 1)
section_marker = "## Custom role and identity boundary\n"
member_section = '''## Tenant member lifecycle and provisioning boundary

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

'''
if section_marker not in handoff:
    raise SystemExit("handoff custom-role section marker missing")
handoff = handoff.replace(section_marker, member_section + section_marker, 1)
handoff = handoff.replace(
    "- user/member invitation/provisioning, JIT/SCIM-style synchronization, or identity-provider/group\n  mapping;",
    "- production invitation delivery, external identity provisioning, JIT/SCIM-style synchronization,\n  or identity-provider/group mapping;",
    1,
)
handoff_path.write_text(handoff)

status_path = Path("docs/STATUS.md")
status = status_path.read_text()
old_roles_ui = '''- The UI also shows tenant membership status and eligible workspace role permissions for context, but
  does not invite/create members, change membership state, configure an identity provider, or assign
  tenant/platform roles.'''
new_roles_ui = '''- The UI also shows tenant membership status and eligible workspace role permissions for context.
  Provider-neutral member creation/status administration is implemented separately in PR #30; this
  Roles & Access surface still does not configure an identity provider or assign tenant/platform
  roles.'''
if old_roles_ui not in status:
    raise SystemExit("STATUS roles UI marker missing")
status = status.replace(old_roles_ui, new_roles_ui, 1)
old_roles_boundary = '''- This original assignment slice does not add production authentication, SSO/group mapping,
  tenant/platform binding administration, member invitations/provisioning, production Cloudflare
  resources, or paid services. Tenant-owned custom workspace role creation/editing is implemented in
  PR #29 as the following slice.'''
new_roles_boundary = '''- This original assignment slice does not add production authentication, SSO/group mapping,
  tenant/platform binding administration, production invitation delivery/external provisioning,
  production Cloudflare resources, or paid services. Tenant-owned custom workspace role
  creation/editing is implemented in PR #29 and provider-neutral member lifecycle in PR #30.'''
if old_roles_boundary not in status:
    raise SystemExit("STATUS original roles boundary marker missing")
status = status.replace(old_roles_boundary, new_roles_boundary, 1)
old_custom_boundary = '''- This slice does **not** configure production authentication/SSO, Entra application registration,
  direct Active Directory connectivity, JIT/SCIM synchronization, member invitations/provisioning,
  provider/group mapping, production Cloudflare resources, customer data/uploads, or paid services.'''
new_custom_boundary = '''- This slice does **not** configure production authentication/SSO, Entra application registration,
  direct Active Directory connectivity, JIT/SCIM synchronization, production invitation delivery or
  external identity provisioning, provider/group mapping, production Cloudflare resources, customer
  data/uploads, or paid services. Provider-neutral direct member lifecycle is added in PR #30.'''
if old_custom_boundary not in status:
    raise SystemExit("STATUS custom role boundary marker missing")
status = status.replace(old_custom_boundary, new_custom_boundary, 1)

member_section = '''### Provider-neutral tenant member lifecycle administration (synthetic/test only)

- `/demo/app/admin/members` provides tenant-wide membership administration over the existing
  `identity_subjects` and `tenant_memberships` tables; no second user directory or authentication
  store is introduced.
- The route uses the server-controlled synthetic Tenant Administrator and requires tenant-level
  `tenant.manage`. Membership administration is deliberately separate from workspace `role.manage`.
- Directly provisioned members are recorded with provider `local`, a server-generated immutable
  provider subject, display name, and email. The slice stores no password, MFA secret, passkey,
  recovery code, access/refresh token, or invitation credential.
- Existing membership values are presented as **Staged / Active / Suspended**. Staged retains the
  stored value `invited` but means pre-provisioned only; no invitation email is sent. New direct
  members may be staged or active.
- Membership transitions support Staged -> Active/Suspended, Active -> Suspended, and Suspended ->
  Active. Direct member deletion and return-to-Staged after activation are intentionally omitted.
- The acting Tenant Administrator cannot suspend their own current membership from this surface.
- The tenant directory shows provider attribution and tenant/workspace role-binding counts. Suspending
  a member does not delete bindings; the existing authorization policy immediately denies access
  because non-active tenant membership fails authorization. Reactivation therefore restores the same
  preserved role relationships.
- Externally sourced identities, including Entra-backed subjects, use the same application membership
  state without mutating the external provider. This preserves the future boundary for Entra ID,
  Active Directory-connected, OIDC, or SAML provisioning/group mapping.
- Direct provisioning normalizes display names/email and rejects a duplicate email already represented
  in the same tenant. IDs, acting identity, tenant, workspace, provider, and audit metadata remain
  server controlled.
- Successful creation appends `tenant.membership.created`; status changes append
  `tenant.membership.status_changed`, including provider, previous/new status, and preserved role
  binding counts, to the existing append-only audit stream.
- Unit coverage verifies staged/local creation, activation, duplicate email rejection, self-suspension
  protection, tenant-management authorization, Entra-backed suspension, preserved role bindings, and
  immediate authorization denial after suspension. Browser coverage verifies staged -> active -> role
  assignment -> suspended behavior, preserved binding display, active-member eligibility changes,
  audit evidence, same-origin protection, accessibility/responsiveness, and independent synthetic
  session isolation.
- This slice does **not** implement production passwords/login, invitation email delivery, Entra app
  registration, Active Directory connectivity, OIDC/SAML configuration, JIT/SCIM provisioning,
  directory/group synchronization, member deletion, production Cloudflare resources, customer
  data/uploads, analytics, or paid services.

'''
workflow_marker = "### Authorized tenant Workflow Definition administration (synthetic/test only)"
if workflow_marker not in status:
    raise SystemExit("STATUS workflow marker missing")
status = status.replace(workflow_marker, member_section + workflow_marker, 1)
old_milestone = '''  administration PR #21, controlled Workflow Definition lifecycle administration PR #27, and
  provider-neutral custom workspace roles PR #29.'''
new_milestone = '''  administration PR #21, controlled Workflow Definition lifecycle administration PR #27,
  provider-neutral custom workspace roles PR #29, and provider-neutral tenant member lifecycle PR
  #30.'''
if old_milestone not in status:
    raise SystemExit("STATUS milestone marker missing")
status = status.replace(old_milestone, new_milestone, 1)
old_unimplemented = '''- Built-in/system role-definition editing; tenant/platform role assignment administration;
  custom-role deletion/retirement; member invitations/provisioning; or identity-provider/group
  mapping/synchronization.'''
new_unimplemented = '''- Built-in/system role-definition editing; tenant/platform role assignment administration;
  custom-role deletion/retirement; member deletion; production invitation delivery; external identity
  provisioning; or identity-provider/group mapping/synchronization.'''
if old_unimplemented not in status:
    raise SystemExit("STATUS unimplemented role/member marker missing")
status = status.replace(old_unimplemented, new_unimplemented, 1)
status_path.write_text(status)
