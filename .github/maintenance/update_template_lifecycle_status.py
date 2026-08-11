from pathlib import Path

path = Path("docs/STATUS.md")
text = path.read_text()

marker = """All app-shaped `/demo` screens remain product-shape proofs, not an authenticated production tenant
application. They remain behind the synthetic/test demo flag and must not be represented as
production authentication or public-demo hardening.
"""
section = """### Authorized controlled Template Lifecycle administration (synthetic/test only)

- `/demo/app/admin/templates` manages lifecycle state for existing controlled template versions in the
  current workspace; it reuses `templates` and `template_versions` rather than introducing a second
  template catalog.
- The route uses a server-controlled synthetic Template Manager and requires `template.manage` at the
  current workspace before catalog reads or lifecycle mutations execute.
- Migration `0004_template_version_lifecycle_integrity.sql` makes template-version content identity and
  provenance database-immutable: version/template IDs, version number, SHA-256, content provider/key,
  creator, provenance, and creation timestamp cannot be rewritten, and historical template versions
  cannot be deleted.
- The database also enforces the documented lifecycle transition graph and requires publish/supersede
  timestamps to be created only by the corresponding legitimate transition.
- Lifecycle mutations call the existing domain transition logic and update only lifecycle state plus
  publish/supersede timestamps; they do not replace content, change a content reference, or fabricate a
  new template version.
- The workspace catalog displays template/version identity, current-revision marker, lifecycle state,
  SHA-256, provider/key reference, provenance, creator, exact source-document count, and only the
  transitions currently allowed from that version's state.
- Successful transitions append `template.version.lifecycle_transitioned` to the existing immutable
  audit stream with template ID, version number, old/new state, and exact content hash.
- Documents already created from a template version keep their stored source template ID, version, and
  hash even after that template version is superseded or retired. Historical template lifecycle
  changes therefore do not silently rewrite document provenance.
- Retired/superseded versions remain historical evidence. The existing create-from-template service
  continues to allow new documents only from approved or published template versions.
- Administration POSTs require the validated synthetic session, fixed expected fields, bounded input
  validation, and same-origin enforcement. Independent synthetic sessions retain isolated template
  lifecycle state.
- Executable SQLite and browser coverage verify lifecycle transitions, publish/supersede timestamps,
  direct content-identity mutation rejection, deletion rejection, invalid lifecycle-jump rejection,
  audit evidence, exact document-provenance preservation, retired-template creation rejection,
  accessibility/responsiveness, cross-origin denial, and session isolation.
- This slice does **not** add template binary/content uploads, new-template creation, new content-version
  authoring, malware scanning, storage orchestration, production authentication, production Cloudflare
  resources, customer data, or paid services.

"""
if marker not in text:
    raise SystemExit("template lifecycle status insertion marker missing")
if "### Authorized controlled Template Lifecycle administration" not in text:
    text = text.replace(marker, section + marker, 1)

old_milestone = """  tenant presentation administration PR #16, workspace Roles & Access administration PR #17, and
  immutable Workflow Definition administration PR #18.
"""
new_milestone = """  tenant presentation administration PR #16, workspace Roles & Access administration PR #17,
  immutable Workflow Definition administration PR #18, and controlled Template Lifecycle
  administration PR #19.
"""
if old_milestone in text:
    text = text.replace(old_milestone, new_milestone, 1)
elif "controlled Template Lifecycle\n  administration PR #19" not in text:
    raise SystemExit("template lifecycle milestone marker missing")

old_gap = """- Workspace workflow applicability/default selection, workflow retirement/deprecation semantics,
  richer workflow authoring, or controlled-template lifecycle mutation UI.
"""
new_gap = """- Workspace workflow applicability/default selection, workflow retirement/deprecation semantics, or
  richer workflow authoring.
- Template content upload/new-version authoring, new-template creation, or storage/scanning
  orchestration.
"""
if old_gap in text:
    text = text.replace(old_gap, new_gap, 1)
elif "Template content upload/new-version authoring" not in text:
    raise SystemExit("template lifecycle remaining-gap marker missing")

path.write_text(text)
