import type { PortableExportV1 } from "../application/export";
import type { ThemeConfig } from "./theme";

export function renderBackupPortability(
  theme: ThemeConfig,
  exported: PortableExportV1,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic Backup and Portability administration surface.">
  <title>Backup &amp; Portability — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <div class="shell header-inner">
      <a class="wordmark" href="/">
        <span>${escapeHtml(theme.companyName)}</span>
        <strong>${escapeHtml(theme.appName)}</strong>
      </a>
      <span class="demo-label">Synthetic tenant administration · read-only preview</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(exported.tenant.name)}</p>
      <a href="/demo/app">Overview</a>
      <a href="/demo/app/documents">Documents</a>
      <a href="/demo/app/templates">Templates</a>
      <a href="/demo/app/reviews">Reviews &amp; Approvals</a>
      <a href="/demo/app/admin/backup" aria-current="page">Backup &amp; Portability</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">Administration · tenant scope</p>
        <h1 id="page-title">Backup &amp; Portability</h1>
        <p class="lede">Export the current tenant's application data in a versioned, validated JSON package. The package is assembled from persisted tenant records rather than a static demo fixture.</p>
      </section>

      <section class="callout" aria-labelledby="export-title">
        <div>
          <p class="eyebrow">Export Application Data</p>
          <h2 id="export-title">Keep a portable copy of the control record.</h2>
          <p>The export includes tenant/workspace configuration, identities and role assignments, documents and immutable version metadata, templates and provenance, workflow/review/approval evidence, audit events, and storage references.</p>
          <p><strong>Content binaries are not bundled in this slice.</strong> R2/SharePoint objects remain external and are represented by their provider and content-key references.</p>
        </div>
        <a class="button" href="/demo/app/admin/backup/export" download>Export Application Data</a>
      </section>

      <section aria-labelledby="package-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Current package preview</p>
            <h2 id="package-title">What will be exported</h2>
          </div>
          <span class="badge">${escapeHtml(exported.format)} · v${exported.version}</span>
        </div>
        <dl class="facts">
          <div><dt>Tenant</dt><dd>${escapeHtml(exported.tenant.name)}</dd></div>
          <div><dt>Permitted data profile</dt><dd>${escapeHtml(exported.tenantConfiguration.permittedDataProfile)}</dd></div>
          <div><dt>Workspaces</dt><dd>${exported.workspaces.length}</dd></div>
          <div><dt>Identity subjects</dt><dd>${exported.identitySubjects.length}</dd></div>
          <div><dt>Memberships</dt><dd>${exported.tenantMemberships.length}</dd></div>
          <div><dt>Role bindings</dt><dd>${exported.roleBindings.length}</dd></div>
          <div><dt>Documents / versions</dt><dd>${exported.documents.length} / ${exported.documentVersions.length}</dd></div>
          <div><dt>Templates / versions</dt><dd>${exported.templates.length} / ${exported.templateVersions.length}</dd></div>
          <div><dt>Workflow instances</dt><dd>${exported.workflowInstances.length}</dd></div>
          <div><dt>Reviews / approvals</dt><dd>${exported.reviews.length} / ${exported.approvals.length}</dd></div>
          <div><dt>Audit events</dt><dd>${exported.auditEvents.length}</dd></div>
        </dl>
      </section>

      <section class="notes" aria-labelledby="boundary-title">
        <p class="eyebrow">Portability boundary</p>
        <h2 id="boundary-title">Portable does not mean silently complete.</h2>
        <ul>
          <li>The JSON package is structurally and referentially validated before download.</li>
          <li>Every exported row is constrained to this tenant; no cross-tenant records are included.</li>
          <li>Storage references identify external content objects, but binary files are not included yet.</li>
          <li>This synthetic route is not production backup scheduling, disaster recovery, retention, or legal hold.</li>
        </ul>
      </section>
    </main>
  </div>
  <footer><div class="shell"><p>Synthetic tenant administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function styles(theme: ThemeConfig): string {
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.intro{padding:3rem 0 2rem}.eyebrow{margin:0 0 .5rem}h1,h2{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.4rem,6vw,4.3rem);letter-spacing:-.04em}h2{margin:.2rem 0 .7rem;font-size:1.45rem}.lede{max-width:800px;font-size:1.08rem;color:var(--muted)}.callout,.notes{display:grid;gap:1.4rem;margin-bottom:2rem;padding:1.4rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.callout p,.notes li{color:var(--muted)}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;align-self:center;padding:.65rem 1rem;border:2px solid var(--brand-primary);border-radius:.35rem;background:var(--brand-primary);color:#fff;font-weight:800;text-decoration:none}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;background:var(--surface-muted);font-size:.8rem;font-weight:800;overflow-wrap:anywhere}.facts{display:grid;gap:0;margin:0 0 2rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised);overflow:hidden}.facts div{display:grid;grid-template-columns:minmax(11rem,.45fr) 1fr;gap:1rem;padding:.8rem 1rem}.facts div+div{border-top:1px solid var(--border)}.facts dt{font-weight:800}.facts dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.notes ul{margin:0;padding-left:1.3rem}.notes li+li{margin-top:.5rem}@media(min-width:760px){.callout{grid-template-columns:minmax(0,1fr) auto;align-items:center}}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:600px){.header-inner,.section-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.facts div{grid-template-columns:1fr;gap:0}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}}`;
}
