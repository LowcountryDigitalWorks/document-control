from pathlib import Path

path = Path("docs/STATUS.md")
text = path.read_text()

section_marker = """All app-shaped `/demo` screens remain product-shape proofs, not an authenticated production tenant
application. They remain behind the synthetic/test demo flag and must not be represented as
production authentication or public-demo hardening.
"""
section = """### Authorized tenant Workflow Definition administration (synthetic/test only)

- `/demo/app/admin/workflows` provides a tenant workflow-definition catalog over the existing
  versioned `workflow_definitions` model; no parallel workflow store is introduced.
- Because workflow definitions are tenant-wide, the synthetic Tenant Administrator must satisfy both
  `tenant.manage` at tenant scope and `workflow.manage` for the current workspace before catalog reads
  or definition/version creation executes. A workspace-only workflow grant is not treated as authority
  to rewrite the tenant-wide catalog by itself.
- Migration `0003_workflow_definition_immutability.sql` makes every persisted workflow-definition
  version database-immutable: direct `UPDATE` and `DELETE` attempts abort. Configuration changes are
  represented by inserting a new immutable version instead of mutating historical rows.
- A new workflow family starts at version 1. A later version keeps the same definition ID and receives
  the next positive version number; each workflow instance continues to reference the exact
  definition ID/version it originally started with.
- Workflow names are required and bounded. State identifiers are unique, bounded, lowercase
  identifiers; definitions may contain at most 20 states. Transitions use `from_state -> to_state`,
  reference defined states only, reject duplicates, and are capped at 50 per definition.
- The catalog groups history by stable definition ID and orders versions newest-first within each
  family, so renaming a later version cannot make an older version appear to be the current/latest
  revision.
- Successful creation emits `workflow.definition.created`; later immutable versions emit
  `workflow.definition.version_created` into the existing append-only audit stream. Existing Backup &
  Portability export includes all workflow definition versions and bound instances.
- Creating a newer definition version does **not** automatically select it for documents, migrate a
  running workflow, rebind an existing instance, or alter approval history. Browser coverage proves a
  newly created v2 of the seeded workflow still leaves a subsequently started guided workflow bound to
  the explicitly selected seeded v1.
- The SQLite-backed browser harness applies the immutability migration, and executable tests cover
  v1/v2 creation, direct update/delete rejection, tenant/version lookup, dual authorization,
  malformed/cross-origin requests, audit evidence, accessibility/responsiveness, and independent
  synthetic-session isolation.
- This slice does not add workspace workflow applicability/default-selection rules, retirement or
  deprecation semantics, automatic migration/activation, graphical workflow authoring, production
  authentication, production Cloudflare resources, customer data, or paid services.

"""
if section_marker not in text:
    raise SystemExit("workflow status insertion marker missing")
text = text.replace(section_marker, section + section_marker, 1)

old_milestone = """  workspace search/filter PR #13, Backup & Portability PR #14, workspace Audit Log PR #15,
  tenant presentation administration PR #16, and workspace Roles & Access administration PR #17.
"""
new_milestone = """  workspace search/filter PR #13, Backup & Portability PR #14, workspace Audit Log PR #15,
  tenant presentation administration PR #16, workspace Roles & Access administration PR #17, and
  immutable Workflow Definition administration PR #18.
"""
if old_milestone not in text:
    raise SystemExit("workflow milestone marker missing")
text = text.replace(old_milestone, new_milestone, 1)

old_gap = "- Workflow-definition management or controlled-template lifecycle mutation UI.\n"
new_gap = (
    "- Workspace workflow applicability/default selection, workflow retirement/deprecation semantics,\n"
    "  richer workflow authoring, or controlled-template lifecycle mutation UI.\n"
)
if old_gap not in text:
    raise SystemExit("workflow gap marker missing")
text = text.replace(old_gap, new_gap, 1)

path.write_text(text)
