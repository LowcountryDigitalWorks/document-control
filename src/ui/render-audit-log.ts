import type {
  AuditLogFilters,
  AuditLogItem,
} from "../application/audit-log-read-service";
import type { ThemeConfig } from "./theme";

export function renderAuditLog(
  theme: ThemeConfig,
  workspaceName: string,
  items: readonly AuditLogItem[],
  filters: AuditLogFilters = {},
): string {
  const filtered = Boolean(filters.query);
  const exportHref = `/demo/app/audit/export.csv${filters.query ? `?q=${encodeURIComponent(filters.query)}` : ""}`;
  const content =
    items.length === 0
      ? `<section class="empty" aria-labelledby="empty-title">
          <p class="eyebrow">${filtered ? "No matches" : "No events yet"}</p>
          <h2 id="empty-title">${filtered ? "No audit events match this search." : "This workspace has no audit events yet."}</h2>
          <p>${filtered ? "Change or clear the search to return to the workspace activity ledger." : "Controlled actions will appear here as append-only audit events."}</p>
          ${filtered ? '<a class="button secondary" href="/demo/app/audit">Clear search</a>' : '<a class="button secondary" href="/demo/workflow">Open guided workflow</a>'}
        </section>`
      : `<ol class="audit-list" aria-label="Workspace audit events">${items.map(renderAuditItem).join("")}</ol>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic authorization-gated workspace Audit Log.">
  <title>Audit Log — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic Auditor · read-only UI</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(workspaceName)}</p>
      <a href="/demo/app">Overview</a>
      <a href="/demo/app/documents">Documents</a>
      <a href="/demo/app/templates">Templates</a>
      <a href="/demo/app/reviews">Reviews &amp; Approvals</a>
      <a href="/demo/app/audit" aria-current="page">Audit Log</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">${escapeHtml(workspaceName)} · audit.read</p>
        <h1 id="page-title">Audit Log</h1>
        <p class="lede">A workspace-scoped view of the existing append-only audit stream. Events are newest first; this screen does not create, copy, or mutate audit records.</p>
      </section>
      <form class="filters" method="get" action="/demo/app/audit" aria-label="Search audit events">
        <div class="filter-field">
          <label for="audit-search">Event, entity, ID, or actor contains</label>
          <input id="audit-search" name="q" type="search" maxlength="100" value="${escapeHtml(filters.query ?? "")}" autocomplete="off">
        </div>
        <div class="filter-actions">
          <button class="button" type="submit">Search audit log</button>
          <a href="/demo/app/audit">Clear</a>
          <a class="button secondary" href="${escapeHtml(exportHref)}">Export current view (CSV)</a>
        </div>
      </form>
      <p class="result-summary" aria-live="polite">${items.length} ${items.length === 1 ? "event" : "events"}${filtered ? " matched" : " shown"}. The ledger view and CSV export use the same 100-record cap and summarized evidence.</p>
      ${content}
    </main>
  </div>
  <footer><div class="shell"><p>Synthetic workspace audit view by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderAuditItem(item: AuditLogItem): string {
  const payload =
    item.payloadSummary.length === 0
      ? ""
      : `<ul class="payload" aria-label="Event evidence summary">${item.payloadSummary.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`;
  return `<li class="audit-card">
    <div class="event-heading">
      <div>
        <p class="eyebrow">${escapeHtml(humanize(item.entityType))}</p>
        <h2>${escapeHtml(humanizeEvent(item.eventType))}</h2>
      </div>
      <time datetime="${escapeHtml(item.occurredAt)}">${escapeHtml(formatTimestamp(item.occurredAt))}</time>
    </div>
    <dl class="facts">
      <div><dt>Actor</dt><dd>${escapeHtml(item.actorName)}</dd></div>
      <div><dt>Entity ID</dt><dd class="mono">${escapeHtml(item.entityId)}</dd></div>
      <div><dt>Event type</dt><dd class="mono">${escapeHtml(item.eventType)}</dd></div>
    </dl>
    ${payload}
  </li>`;
}

function humanizeEvent(value: string): string {
  return value.split(".").map(humanize).join(" · ");
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.intro{padding:3rem 0 2rem}.eyebrow{margin:0 0 .5rem}h1,h2{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.4rem,6vw,4.3rem);letter-spacing:-.04em}h2{margin:.15rem 0 .4rem;font-size:1.25rem}.lede{max-width:800px;font-size:1.08rem;color:var(--muted)}.filters,.empty,.audit-card{padding:1.2rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.filters{display:grid;gap:1rem;margin-bottom:1rem}.filter-field{display:grid;gap:.35rem}.filter-field label{font-weight:800}.filter-field input{width:100%;min-height:44px;padding:.55rem .65rem;border:1px solid var(--border);border-radius:.35rem;background:var(--surface);color:var(--text);font:inherit}.filter-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:.65rem 1rem;border:2px solid var(--brand-primary);border-radius:.35rem;background:var(--brand-primary);color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.secondary{background:transparent;color:var(--text)}.filter-actions a{font-weight:800}.result-summary{margin:0 0 1rem;color:var(--muted)}.audit-list{display:grid;gap:1rem;margin:0;padding:0;list-style:none}.event-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.event-heading time{font-size:.9rem;color:var(--muted);white-space:nowrap}.facts{display:grid;gap:.5rem;margin:1rem 0}.facts div{display:grid;grid-template-columns:minmax(7rem,.3fr) 1fr;gap:1rem}.facts dt{font-weight:800}.facts dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.payload{display:flex;gap:.5rem;flex-wrap:wrap;margin:0;padding:0;list-style:none}.payload li{padding:.25rem .5rem;border-radius:.3rem;background:var(--surface-muted);font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}.empty{margin-bottom:3rem}.empty p{color:var(--muted)}@media(min-width:720px){.filters{grid-template-columns:minmax(0,1fr) auto;align-items:end}}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:600px){.header-inner,.event-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.facts div{grid-template-columns:1fr;gap:0}.event-heading time{white-space:normal}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}}`;
}
