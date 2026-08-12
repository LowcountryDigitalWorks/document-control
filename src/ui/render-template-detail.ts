import type {
  TemplateDetailEvidence,
  TemplateVersionEvidence,
} from "../application/template-detail-read-service";
import type { ThemeConfig } from "./theme";

export function renderTemplateDetail(
  theme: ThemeConfig,
  detail: TemplateDetailEvidence,
): string {
  const current = detail.versions.find((version) => version.isCurrent);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic controlled template evidence and immutable version lineage.">
  <title>${escapeHtml(detail.name)} — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic evidence · controlled template</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(detail.workspaceName)}</p>
      <a href="/demo/app">Overview</a>
      <a href="/demo/app/documents">Documents</a>
      <a href="/demo/app/templates" aria-current="page">Templates</a>
      <a href="/demo/app/reviews">Reviews &amp; Approvals</a>
      <a href="/demo/app/audit">Audit Log</a>
      <a href="/demo/app/admin/settings">Administration</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">
      <p class="back"><a href="/demo/app/templates">← Back to Templates</a></p>
      <section class="intro" aria-labelledby="page-title">
        <div class="title-row">
          <div>
            <p class="eyebrow">Controlled template</p>
            <h1 id="page-title">${escapeHtml(detail.name)}</h1>
            <p class="lede">Immutable version lineage assembled from persisted tenant/workspace-scoped template records. Lifecycle changes never rewrite historical content identity or provenance.</p>
          </div>
          ${current ? `<span class="badge ${current.lifecycleState === "published" ? "success" : "neutral"}">Current · ${escapeHtml(lifecycleLabel(current.lifecycleState))}</span>` : '<span class="badge neutral">No current version</span>'}
        </div>
        <dl class="summary">
          <div><dt>Current version</dt><dd>${detail.currentVersion ?? "—"}</dd></div>
          <div><dt>Versions preserved</dt><dd>${detail.versions.length}</dd></div>
          <div><dt>Template created</dt><dd>${escapeHtml(formatTimestamp(detail.createdAt))}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="versions-title">
        <p class="eyebrow">Version evidence</p>
        <h2 id="versions-title">Exact identity and provenance remain visible over time.</h2>
        <p class="section-copy">Newest versions are shown first. This read-only evidence view does not expose storage keys or provide lifecycle mutation controls.</p>
        <div class="version-list">${detail.versions.map(renderVersion).join("")}</div>
      </section>
    </main>
  </div>
  <footer><div class="shell"><p>Synthetic template evidence by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderVersion(version: TemplateVersionEvidence): string {
  return `<article class="version-card">
    <div class="version-heading">
      <div>
        <p class="eyebrow">Version ${version.versionNumber}</p>
        <h3>${version.isCurrent ? "Current version" : "Historical version"}</h3>
        <p>Created by ${escapeHtml(version.createdByName)} · ${escapeHtml(formatTimestamp(version.createdAt))}</p>
      </div>
      <span class="badge ${version.lifecycleState === "published" ? "success" : "neutral"}">${escapeHtml(lifecycleLabel(version.lifecycleState))}</span>
    </div>
    <dl class="facts">
      <div><dt>SHA-256 identity</dt><dd class="hash">${escapeHtml(version.contentHash)}</dd></div>
      <div><dt>Provenance</dt><dd>${escapeHtml(version.provenance)}</dd></div>
      <div><dt>Published</dt><dd>${version.publishedAt ? escapeHtml(formatTimestamp(version.publishedAt)) : "—"}</dd></div>
      <div><dt>Superseded</dt><dd>${version.supersededAt ? escapeHtml(formatTimestamp(version.supersededAt)) : "—"}</dd></div>
    </dl>
  </article>`;
}

function lifecycleLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.back{margin:1.5rem 0 0}.intro{padding:2.2rem 0 2.5rem}.eyebrow{margin:0 0 .5rem}h1,h2,h3{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.3rem,6vw,4.1rem);letter-spacing:-.04em}h2{margin:.2rem 0 .7rem;font-size:clamp(1.6rem,4vw,2.2rem)}h3{margin:.2rem 0 .5rem;font-size:1.35rem}.lede,.section-copy{max-width:800px;color:var(--muted)}.lede{font-size:1.08rem}.title-row,.version-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.summary{display:grid;gap:.8rem;margin:1.6rem 0 0}.summary div,.facts div{display:grid;gap:.2rem}.summary dt,.facts dt{font-weight:800}.summary dd,.facts dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.version-list{display:grid;gap:1rem;margin-top:1.2rem}.version-card{padding:1.3rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.version-heading p{margin:.35rem 0;color:var(--muted)}.facts{display:grid;gap:.8rem;margin:1.2rem 0 0}.hash{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800;white-space:nowrap}.badge.success{background:#d8f3e5;color:#0b5a36}.badge.neutral{background:var(--surface-muted);color:var(--text)}@media(min-width:720px){.summary{grid-template-columns:repeat(3,minmax(0,1fr))}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:600px){.header-inner,.title-row,.version-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}.badge.success{background:#103f2b;color:#a8ebca}}`;
}
