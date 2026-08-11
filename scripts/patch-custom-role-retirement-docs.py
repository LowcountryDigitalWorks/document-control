from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"documentation marker missing in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# README
replace_once(
    "README.md",
    "- tenant presentation settings, provider-neutral tenant member lifecycle, workspace Roles & Access, and tenant-owned custom workspace roles;",
    "- tenant presentation settings, provider-neutral tenant member lifecycle, workspace Roles & Access, and tenant-owned custom workspace roles with terminal retirement;",
)
replace_once(
    "README.md",
    "workspace `role.manage`; assigning an existing eligible workspace role remains a `role.manage`\noperation.\n",
    "workspace `role.manage`; assigning an existing eligible workspace role remains a `role.manage`\noperation. Tenant-owned custom roles may be terminally retired only after all assignments are removed.\nRetirement preserves the definition and permissions for audit/export history while preventing later\nediting, reactivation, or new assignment. Hard deletion remains intentionally unsupported.\n",
)

# HANDOFF
replace_once(
    "docs/HANDOFF.md",
    "- tenant-owned custom workspace role creation/editing with bounded operational permissions and\n  tenant-wide assignment-impact acknowledgement;",
    "- tenant-owned custom workspace role creation/editing with bounded operational permissions,\n  tenant-wide assignment-impact acknowledgement, and terminal non-destructive retirement;",
)
replace_once(
    "docs/HANDOFF.md",
    "- Custom roles and their bindings are already represented by the existing portable export model.\n\nCustom-role deletion is intentionally not implemented yet. A future delete/retire design must define\nhistorical/audit behavior and current-binding handling rather than silently removing a role definition.\n",
    "- Custom roles and their bindings are already represented by the existing portable export model.\n- A tenant-owned custom workspace role may be retired only after every tenant assignment is removed.\n  Retirement is terminal: the definition and permissions remain visible for audit/export history, but\n  the role cannot be edited, reactivated, or assigned again. Database triggers independently enforce\n  the zero-binding requirement and block new bindings to a retired role.\n- Retirement appends `role.definition.retired` to the existing audit stream and portable export carries\n  optional `retiredAt` metadata.\n\nCustom-role hard deletion is intentionally not implemented. Preserve retired role definitions and\nhistorical evidence rather than introducing destructive cleanup.\n",
)
replace_once(
    "docs/HANDOFF.md",
    "- custom-role deletion/retirement;",
    "- custom-role hard deletion;",
)

# STATUS — reconcile the original custom-role slice and add this release milestone.
replace_once(
    "docs/STATUS.md",
    "- Built-in system role definitions remain immutable. Custom-role deletion/retirement is deliberately\n  deferred until historical/audit and current-binding behavior is explicitly designed.",
    "- Built-in system role definitions remain immutable. Terminal non-destructive custom-role retirement\n  is implemented in PR #31; hard deletion remains deliberately unsupported.",
)
member_heading = "### Provider-neutral tenant member lifecycle administration (synthetic/test only)"
retirement_section = '''### Terminal custom workspace role retirement (synthetic/test only)\n\n- PR #31 adds terminal, non-destructive retirement for tenant-owned custom `workspace` roles without\n  deleting the role definition or introducing a parallel lifecycle store. Migration\n  `0007_custom_role_retirement.sql` adds nullable `retired_at` metadata to `role_definitions`.\n- Retirement requires the same dual authority as custom-role definition administration:\n  tenant-level `tenant.manage` plus current-workspace `role.manage`. Built-in/system roles and roles\n  outside the tenant-owned workspace scope cannot be retired.\n- Every tenant assignment to the role must be removed before retirement. The UI shows retirement as\n  unavailable while assignments remain; the service returns a bounded conflict and a database trigger\n  independently rejects retirement when any binding still references the role.\n- Retirement is terminal. Retired definitions remain visible as historical records but cannot be\n  edited, reactivated, or selected for new assignment. A database trigger independently rejects new\n  role bindings to a retired role.\n- Successful retirement appends `role.definition.retired` to the existing append-only audit stream.\n  Portable export preserves the role definition and adds optional `retiredAt` metadata without\n  changing the export version or storing provider credentials.\n- Unit/invariant coverage verifies the zero-assignment requirement, built-in-role protection, terminal\n  state, edit/assignment rejection, database trigger enforcement, input validation, and dual\n  authorization. Browser coverage verifies create -> assign -> remove -> retire behavior, retired-role\n  UI/read-only history, assignment exclusion, audit evidence, same-origin protection, and axe\n  accessibility on the synthetic administration surface.\n- This slice does **not** hard-delete role definitions/history, configure production authentication or\n  identity providers, add Entra/AD/OIDC/SAML/SCIM integration, touch production Cloudflare resources,\n  accept customer data/uploads, or add paid services.\n\n'''
replace_once("docs/STATUS.md", member_heading, retirement_section + member_heading)
replace_once(
    "docs/STATUS.md",
    "  provider-neutral custom workspace roles PR #29, and provider-neutral tenant member lifecycle PR\n  #30.",
    "  provider-neutral custom workspace roles PR #29, provider-neutral tenant member lifecycle PR #30,\n  and terminal custom role retirement PR #31.",
)
replace_once(
    "docs/STATUS.md",
    "- Built-in/system role-definition editing; tenant/platform role assignment administration;\n  custom-role deletion/retirement; member deletion; production invitation delivery; external identity\n  provisioning; or identity-provider/group mapping/synchronization.",
    "- Built-in/system role-definition editing; tenant/platform role assignment administration;\n  custom-role hard deletion; member deletion; production invitation delivery; external identity\n  provisioning; or identity-provider/group mapping/synchronization.",
)

# Identity / authorization boundary
replace_once(
    "docs/IDENTITY_AUTHORIZATION_BOUNDARY.md",
    "Creating or editing a tenant-owned custom role requires both tenant-level `tenant.manage` and\nworkspace-level `role.manage`. Assigning an existing eligible workspace role remains a workspace\n`role.manage` operation.\n",
    "Creating, editing, or retiring a tenant-owned custom role requires both tenant-level `tenant.manage`\nand workspace-level `role.manage`. Assigning an existing eligible workspace role remains a workspace\n`role.manage` operation.\n\nCustom-role retirement is application-owned and provider-neutral. It is allowed only after every role\nbinding is removed, is terminal once recorded, preserves the definition for audit/export history, and\nprevents later editing or assignment. Hard deletion is intentionally not part of the authorization\nmodel.\n",
)
replace_once(
    "docs/IDENTITY_AUTHORIZATION_BOUNDARY.md",
    "- Use immutable provider subject/group identifiers for mappings.\n",
    "- Use immutable provider subject/group identifiers for mappings.\n- Never create or retain an external group mapping that targets a retired application role.\n",
)
