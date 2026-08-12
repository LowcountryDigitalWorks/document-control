import type { TemplateLifecycleCatalog } from "../application/template-lifecycle-admin-service";
import type { ThemeConfig } from "./theme";

export function renderTemplateLifecycleAdmin(
  theme: ThemeConfig,
  catalog: TemplateLifecycleCatalog,
  notice?: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic controlled template lifecycle administration.">
  <title>Template Lifecycle — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header><div class="shell header-inner"><a class="wordmark" href="/demo/app"><span>${escapeHtml(theme.companyName)}</span><strong>${escapeHtml(theme.appName)}</strong></a><span class="demo-label">Synthetic Template Manager</span></div></header>
  <main id="main" class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/demo/app">${escapeHtml(theme.terminology.workspace)}</a><span aria-hidden="true">/</span><a href="/demo/app/admin/settings">Administration</a><span aria-hidden="true">/</span><span>Template Lifecycle</span></nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Controlled templates</p>
      <h1 id="page-title">Template Lifecycle</h1>
      <p class="lede">Control existing template lifecycles and create a new immutable Draft revision from any exact historical version. An unchanged-content revision reuses the source hash and content reference; it does not claim that a binary was edited or uploaded.</p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <p class="eyebrow">Integrity boundary</p><h2 id="boundary-title">Immutable revisions</h2>
      <ul>
        <li>Template binaries/content references are not uploaded, edited, or replaced on this screen.</li>
        <li>A new Draft revision can be derived from any exact historical version, but it reuses that version's SHA-256, provider, and content key unchanged.</li>
        <li>Only one Draft/Review revision may be open in a template family at a time, and revisions advance sequentially.</li>
        <li>Version number, SHA-256, storage provider/key, creator, provenance, and creation timestamp remain database-immutable after creation.</li>
        <li>Published or approved templates may be used to create documents; superseded/retired versions remain historical evidence.</li>
        <li>Revision creation and lifecycle transitions append evidence to the audit stream.</li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="catalog-title">
      <div class="section-heading"><div><p class="eyebrow">Workspace catalog</p><h2 id="catalog-title">Template versions</h2></div><p>${catalog.versions.length} version${catalog.versions.length === 1 ? "" : "s"}</p></div>
      ${catalog.versions.length === 0 ? '<p class="empty">No controlled template versions are recorded in this workspace.</p>' : `<div class="version-list">${catalog.versions.map((version) => renderVersion(version, catalog)).join("")}</div>`}
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic template administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderVersion(
  version: TemplateLifecycleCatalog["versions"][number],
  catalog: TemplateLifecycleCatalog,
): string {
  const openRevision = catalog.versions.find(
    (candidate) =>
      candidate.templateId === version.templateId &&
      (candidate.lifecycleState === "draft" ||
        candidate.lifecycleState === "review"),
  );
  const revisionControl = openRevision
    ? version.isCurrent
      ? `<p class="revision-note"><strong>Revision in progress:</strong> v${openRevision.versionNumber} is ${escapeHtml(labelState(openRevision.lifecycleState))}. Complete or retire it before creating another Draft revision.</p>`
      : ""
    : `<form method="post" action="/demo/app/admin/templates/revisions" class="revision-form">
        <input type="hidden" name="sourceTemplateVersionId" value="${escapeHtml(version.id)}">
        <p><strong>Create from exact v${version.versionNumber}</strong> — copies this version's SHA-256, provider, and content key unchanged into a new immutable Draft revision.</p>
        <label>Revision note <textarea name="revisionNote" rows="2" maxlength="500" required placeholder="Why is this unchanged-content revision being created?"></textarea></label>
        <label class="checkbox"><input type="checkbox" name="confirmUnchangedContent" value="confirmed" required> I confirm no binary/content change is being represented by this revision.</label>
        <button type="submit">Create draft revision</button>
      </form>`;
  return `<article class="version-card">
    <div class="version-heading"><div><strong>${escapeHtml(version.templateName)}</strong><span>v${version.versionNumber}${version.isCurrent ? " · current revision" : ""}</span></div><span class="state">${escapeHtml(labelState(version.lifecycleState))}</span></div>
    <dl>
      <div><dt>Template version ID</dt><dd><code>${escapeHtml(version.id)}</code></dd></div>
      <div><dt>SHA-256</dt><dd><code>${escapeHtml(version.contentHash)}</code></dd></div>
      <div><dt>Provenance</dt><dd>${escapeHtml(version.provenance)}</dd></div>
      <div><dt>Created by</dt><dd>${escapeHtml(version.creatorName)}</dd></div>
      <div><dt>Source documents</dt><dd>${version.sourceDocumentCount}</dd></div>
      <div><dt>Content reference</dt><dd><code>${escapeHtml(version.contentProvider)}:${escapeHtml(version.contentKey)}</code></dd></div>
    </dl>
    ${version.availableTransitions.length === 0 ? '<p class="empty">No further lifecycle transitions are available.</p>' : `<form method="post" action="/demo/app/admin/templates/transition" class="transition-form"><input type="hidden" name="templateVersionId" value="${escapeHtml(version.id)}"><label>Move to <select name="targetState" required>${version.availableTransitions.map((state) => `<option value="${escapeHtml(state)}">${escapeHtml(labelState(state))}</option>`).join("")}</select></label><button type="submit">Apply lifecycle transition</button></form>`}
    ${revisionControl}
  </article>`;
}

function labelState(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:850px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading p{margin:0;color:var(--muted)}.version-list{display:grid;gap:1rem}.version-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1rem}.version-heading{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.version-heading div{display:grid;gap:.1rem}.version-heading span{color:var(--muted)}.state{font-weight:850;color:var(--brand-secondary)!important}.version-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem 1rem}.version-card dl div{min-width:0}.version-card dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}.version-card dd{margin:.15rem 0;overflow-wrap:anywhere}.transition-form{display:flex;align-items:end;gap:1rem;margin-top:1rem}.transition-form label{display:grid;gap:.35rem;font-weight:750;color:var(--brand-primary);min-width:min(260px,100%)}.revision-form{display:grid;gap:.7rem;border-top:1px solid var(--border);margin-top:1rem;padding-top:1rem}.revision-form p,.revision-note{margin:.1rem 0;color:var(--muted)}.revision-form label{display:grid;gap:.35rem;font-weight:750;color:var(--brand-primary)}.revision-form .checkbox{display:flex;align-items:flex-start;gap:.55rem;font-weight:650;color:var(--text)}.revision-form .checkbox input{margin-top:.25rem;flex:0 0 auto}.revision-form button{justify-self:start}textarea,select,button{min-height:44px;border-radius:10px;font:inherit}textarea,select{border:1px solid var(--border);background:var(--raised);color:var(--text);padding:.55rem .7rem}textarea{width:100%;resize:vertical}button{border:0;background:var(--brand-primary);color:white;font-weight:800;padding:.6rem 1rem;cursor:pointer}.empty{color:var(--muted)}code{overflow-wrap:anywhere}@media(max-width:760px){.header-inner{align-items:flex-start;flex-direction:column;padding-block:1rem}.section-heading,.version-heading,.transition-form{align-items:flex-start;flex-direction:column}.version-card dl{grid-template-columns:1fr}.transition-form label{width:100%}select,button{width:100%}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}select{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.boundary h2,.panel h2,.transition-form label,.revision-form label{color:#f1f5f2}button{background:var(--brand-secondary)}}`;
}
