from pathlib import Path

path = Path("docs/STATUS.md")
text = path.read_text()

old_read_only = '''- The screen is assignment-only: system and tenant-defined role definitions and their permission
  lists are displayed read-only and are never edited by this slice.'''
new_read_only = '''- The original assignment slice kept role definitions read-only. Tenant-owned custom workspace role
  definition administration is added in PR #29 below; built-in system role definitions remain
  immutable.'''
if old_read_only not in text:
    raise SystemExit("roles read-only marker missing")
text = text.replace(old_read_only, new_read_only, 1)

old_boundary = '''- This slice does not add production authentication, SSO/group mapping, custom role-definition
  creation/editing, tenant/platform binding administration, member invitations/provisioning,
  production Cloudflare resources, or paid services.'''
new_boundary = '''- This original assignment slice does not add production authentication, SSO/group mapping,
  tenant/platform binding administration, member invitations/provisioning, production Cloudflare
  resources, or paid services. Tenant-owned custom workspace role creation/editing is implemented in
  PR #29 as the following slice.'''
if old_boundary not in text:
    raise SystemExit("roles boundary marker missing")
text = text.replace(old_boundary, new_boundary, 1)

section = '''### Tenant-owned custom workspace role administration (synthetic/test only)

- `/demo/app/admin/access` now supports tenant-owned custom `workspace` role definitions in the
  existing `role_definitions` table; no parallel ACL, provider-specific role store, or new schema is
  introduced.
- Authentication source remains separate from application authorization. Small deployments can use
  directly provisioned/app-managed members and roles, while future Microsoft Entra ID, Active
  Directory-connected, OIDC, or SAML deployments can map external identities/groups into the same
  internal memberships, role definitions, and bindings.
- The existing identity schema already supports `local`, `oidc`, `saml`, `entra`, and `external`
  subjects. Provider identity describes where a subject came from and does not grant permissions by
  itself.
- Custom workspace roles use a bounded operational permission allow-list. They intentionally cannot
  grant wildcard `*`, `tenant.manage`, `workspace.manage`, or `role.manage`, preventing a custom
  operational role from becoming an access-administration privilege-escalation path.
- Creating or editing a tenant-owned custom role requires tenant-level `tenant.manage` plus
  current-workspace `role.manage`. Assigning an existing eligible workspace role continues to require
  only current-workspace `role.manage`.
- Built-in system role definitions remain immutable. Custom-role deletion/retirement is deliberately
  deferred until historical/audit and current-binding behavior is explicitly designed.
- Before changing a custom role that is currently assigned, the administration surface shows the
  tenant-wide affected subject/workspace assignments and requires acknowledgement. The role change
  then applies consistently anywhere that tenant-owned role is bound.
- Role names and submitted permission values are bounded/validated server-side. Duplicate tenant
  custom-role names are rejected case-insensitively and unsupported/admin permissions are rejected
  again in the application service rather than relying only on the UI.
- Successful definition changes append `role.definition.created` and `role.definition.updated`
  events to the existing append-only audit stream. Existing role-binding audit events remain
  unchanged.
- Backup & Portability already exports role definitions and role bindings, so custom role definitions
  and their assignments remain inside the existing portable application-data contract without a new
  export version.
- Unit coverage verifies dual authorization, safe permission enforcement, duplicate-name rejection,
  tenant-wide assignment impact, acknowledgement, audit evidence, and identity-provider independence
  including an Entra-backed synthetic subject. Browser coverage verifies create -> assign -> impact ->
  update -> audit behavior, unsafe-permission rejection, same-origin protection, accessibility,
  responsiveness, and synthetic-session isolation.
- `docs/IDENTITY_AUTHORIZATION_BOUNDARY.md` records the future provider/group mapping contract,
  immutable external identifier requirements, deprovisioning considerations, break-glass/MFA
  expectations, and the rule that provider credentials/tokens never belong in role definitions or
  portable exports.
- This slice does **not** configure production authentication/SSO, Entra application registration,
  direct Active Directory connectivity, JIT/SCIM synchronization, member invitations/provisioning,
  provider/group mapping, production Cloudflare resources, customer data/uploads, or paid services.

'''
marker = "### Authorized tenant Workflow Definition administration (synthetic/test only)"
if marker not in text:
    raise SystemExit("workflow admin section marker missing")
text = text.replace(marker, section + marker, 1)

old_milestone = '''  PR #19, Template Lifecycle integration reconciliation PR #20, workspace Workflow Selection
  administration PR #21, and controlled Workflow Definition lifecycle administration PR #27.'''
new_milestone = '''  PR #19, Template Lifecycle integration reconciliation PR #20, workspace Workflow Selection
  administration PR #21, controlled Workflow Definition lifecycle administration PR #27, and
  provider-neutral custom workspace roles PR #29.'''
if old_milestone not in text:
    raise SystemExit("milestone marker missing")
text = text.replace(old_milestone, new_milestone, 1)

old_unimplemented = '''- Custom/system role-definition creation/editing or permission-authoring UI; tenant/platform role
  assignment administration; member invitations/provisioning; or identity-provider/group mapping.'''
new_unimplemented = '''- Built-in/system role-definition editing; tenant/platform role assignment administration;
  custom-role deletion/retirement; member invitations/provisioning; or identity-provider/group
  mapping/synchronization.'''
if old_unimplemented not in text:
    raise SystemExit("unimplemented role marker missing")
text = text.replace(old_unimplemented, new_unimplemented, 1)

path.write_text(text)
