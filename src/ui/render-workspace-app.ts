import {
  documentStatuses,
  templateLifecycleStates,
  type WorkspaceDocumentFilters,
  type WorkspaceDocumentListItem,
  type WorkspaceOverview,
  type WorkspaceTemplateFilters,
  type WorkspaceTemplateListItem,
} from "../application/workspace-read-service";
import type { ThemeConfig } from "./theme";

export function renderWorkspaceOverview(
  theme: ThemeConfig,
  overview: WorkspaceOverview,
): string {
  return renderWorkspacePage(
    theme,
    overview.workspaceName,
    "overview",
    `<section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Synthetic tenant · ${escapeHtml(overview.workspaceName)}</p>
      <h1 id="page-title">Document control at a glance.</h1>
      <p class="lede">A read-only workspace view backed by the real authorization and D1-compatible query layers. Production authentication is intentionally not represented here.</p>
    </section>
    <section class="metrics" aria-label="Workspace summary">
      ${metric("Documents", overview.documentCount.toString(), "Controlled and working records")}
      ${metric("Templates", overview.templateCount.toString(), "Controlled creation sources")}
      ${metric("Current approvals", overview.currentApprovedCount.toString(), "Exact current versions approved")}
      ${metric("In review", overview.reviewQueueCount.toString(), "Documents awaiting workflow action")}
    </section>
    <section class="next" aria-labelledby="next-title">
      <div>
        <p class="eyebrow">Explore the workspace</p>
        <h2 id="next-title">See the records behind the counts.</h2>
        <p>Documents, Templates, and workflow queues use independent permission checks before persisted records reach the UI.</p>
      </div>
      <div class="actions">
        <a class="button" href="/demo/app/documents">View documents</a>
        <a class="button secondary" href="/demo/app/templates">View templates</a>
        <a class="button secondary" href="/demo/app/reviews">Reviews &amp; approvals</a>
      </div>
    </section>`,
  );
}

export function renderWorkspaceDocuments(
  theme: ThemeConfig,
  workspaceName: string,
  documents: readonly WorkspaceDocumentListItem[],
  filters: WorkspaceDocumentFilters = {},
): string {
  const filtered = hasDocumentFilters(filters);
  const content =
    documents.length === 0
      ? filtered
        ? `<section class="empty" aria-labelledby="empty-title">
            <p class="eyebrow">No matches</p>
            <h2 id="empty-title">No documents match these filters.</h2>
            <p>Change the search or filter values, or clear them to return to the full workspace list.</p>
            <a class="button secondary" href="/demo/app/documents">Clear filters</a>
          </section>`
        : `<section class="empty" aria-labelledby="empty-title">
            <p class="eyebrow">No documents yet</p>
            <h2 id="empty-title">The workspace is ready for its first controlled document.</h2>
            <p>Use the guided synthetic workflow to create a document from the approved template. This screen will then read the persisted record through the authorization boundary.</p>
            <a class="button" href="/demo/workflow">Open guided workflow</a>
          </section>`
      : `<div class="record-list">${documents
          .map(
            (document) => `<article class="record-card">
              <div class="record-heading">
                <div>
                  <p class="eyebrow">${escapeHtml(statusLabel(document.status))}</p>
                  <h2>${escapeHtml(document.title)}</h2>
                </div>
                <span class="badge ${document.exactCurrentApproval ? "success" : "warning"}">
                  ${document.exactCurrentApproval ? "Current version approved" : "Current approval required"}
                </span>
              </div>
              <dl class="facts">
                <div><dt>Current version</dt><dd>${document.currentVersionNumber ?? "—"}</dd></div>
                <div><dt>Updated</dt><dd>${escapeHtml(formatTimestamp(document.updatedAt))}</dd></div>
              </dl>
              ${document.currentVersionHash ? `<p class="hash">${escapeHtml(shortHash(document.currentVersionHash))}</p>` : ""}
              <a class="text-link" href="/demo/app/documents/${encodeURIComponent(document.id)}">View evidence</a>
            </article>`,
          )
          .join("")}</div>`;

  return renderWorkspacePage(
    theme,
    workspaceName,
    "documents",
    `<section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">${escapeHtml(workspaceName)}</p>
      <h1 id="page-title">Documents</h1>
      <p class="lede">Current state is calculated from persisted document/version evidence. Search is a bounded literal title match; filters remain tenant/workspace scoped and approval means an exact current-version/hash match.</p>
    </section>
    ${renderDocumentFilters(filters)}
    <p class="result-summary" aria-live="polite">${documents.length} ${documents.length === 1 ? "document" : "documents"}${filtered ? " matched" : " shown"}. Lists are capped at 100 records.</p>
    ${content}`,
  );
}

export function renderWorkspaceTemplates(
  theme: ThemeConfig,
  workspaceName: string,
  templates: readonly WorkspaceTemplateListItem[],
  filters: WorkspaceTemplateFilters = {},
): string {
  const filtered = hasTemplateFilters(filters);
  const content =
    templates.length === 0
      ? filtered
        ? `<section class="empty" aria-labelledby="empty-title">
            <p class="eyebrow">No matches</p>
            <h2 id="empty-title">No templates match these filters.</h2>
            <p>Change the search or lifecycle value, or clear the filters to return to the full list.</p>
            <a class="button secondary" href="/demo/app/templates">Clear filters</a>
          </section>`
        : '<p class="empty">No controlled templates are available in this workspace.</p>'
      : `<div class="record-list">${templates
          .map(
            (template) => `<article class="record-card">
              <div class="record-heading">
                <div>
                  <p class="eyebrow">Controlled template</p>
                  <h2>${escapeHtml(template.name)}</h2>
                </div>
                <span class="badge ${template.lifecycleState === "published" ? "success" : "neutral"}">${escapeHtml(template.lifecycleState ? lifecycleLabel(template.lifecycleState) : "No current version")}</span>
              </div>
              <dl class="facts">
                <div><dt>Current version</dt><dd>${template.currentVersion ?? "—"}</dd></div>
                <div><dt>Provenance</dt><dd>${escapeHtml(template.provenance ?? "Not recorded")}</dd></div>
              </dl>
              ${template.contentHash ? `<p class="hash">${escapeHtml(shortHash(template.contentHash))}</p>` : ""}
            </article>`,
          )
          .join("")}</div>`;

  return renderWorkspacePage(
    theme,
    workspaceName,
    "templates",
    `<section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">${escapeHtml(workspaceName)}</p>
      <h1 id="page-title">Templates</h1>
      <p class="lede">Controlled templates preserve exact version, lifecycle, content hash, and provenance. Search is a bounded literal name match and existing documents never silently inherit a later template change.</p>
    </section>
    ${renderTemplateFilters(filters)}
    <p class="result-summary" aria-live="polite">${templates.length} ${templates.length === 1 ? "template" : "templates"}${filtered ? " matched" : " shown"}. Lists are capped at 100 records.</p>
    ${content}`,
  );
}

type ActiveNavigation = "overview" | "documents" | "templates";

function renderDocumentFilters(filters: WorkspaceDocumentFilters): string {
  return `<form class="filters" method="get" action="/demo/app/documents" aria-label="Filter documents">
    <div class="filter-field grow">
      <label for="document-search">Title contains</label>
      <input id="document-search" name="q" type="search" maxlength="100" value="${escapeHtml(filters.query ?? "")}" autocomplete="off">
    </div>
    <div class="filter-field">
      <label for="document-status">Status</label>
      <select id="document-status" name="status">
        <option value="">All statuses</option>
        ${documentStatuses.map((status) => option(status, statusLabel(status), filters.status)).join("")}
      </select>
    </div>
    <div class="filter-field">
      <label for="document-approval">Current approval</label>
      <select id="document-approval" name="approval">
        <option value="">Any approval state</option>
        ${option("approved", "Current version approved", filters.currentApproval)}
        ${option("required", "Approval required", filters.currentApproval)}
      </select>
    </div>
    <div class="filter-actions">
      <button class="button" type="submit">Apply filters</button>
      <a href="/demo/app/documents">Clear</a>
    </div>
  </form>`;
}

function renderTemplateFilters(filters: WorkspaceTemplateFilters): string {
  return `<form class="filters" method="get" action="/demo/app/templates" aria-label="Filter templates">
    <div class="filter-field grow">
      <label for="template-search">Name contains</label>
      <input id="template-search" name="q" type="search" maxlength="100" value="${escapeHtml(filters.query ?? "")}" autocomplete="off">
    </div>
    <div class="filter-field">
      <label for="template-lifecycle">Lifecycle</label>
      <select id="template-lifecycle" name="lifecycle">
        <option value="">All lifecycle states</option>
        ${templateLifecycleStates.map((state) => option(state, lifecycleLabel(state), filters.lifecycle)).join("")}
      </select>
    </div>
    <div class="filter-actions">
      <button class="button" type="submit">Apply filters</button>
      <a href="/demo/app/templates">Clear</a>
    </div>
  </form>`;
}

function renderWorkspacePage(
  theme: ThemeConfig,
  workspaceName: string,
  active: ActiveNavigation,
  content: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic authorized document-control workspace.">
  <title>${escapeHtml(navLabel(active))} — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic workspace · read-only UI</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(workspaceName)}</p>
      ${navLink("/demo/app", "Overview", active === "overview")}
      ${navLink("/demo/app/documents", "Documents", active === "documents")}
      ${navLink("/demo/app/templates", "Templates", active === "templates")}
      <a href="/demo/app/reviews">Reviews &amp; Approvals</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">${content}</main>
  </div>
  <footer><div class="shell"><p>Synthetic authorized workspace by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function navLink(href: string, label: string, current: boolean): string {
  return `<a href="${href}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
}

function navLabel(active: ActiveNavigation): string {
  if (active === "documents") return "Documents";
  if (active === "templates") return "Templates";
  return "Workspace";
}

function metric(label: string, value: string, detail: string): string {
  return `<article class="metric"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function option(
  value: string,
  label: string,
  selectedValue: string | undefined,
): string {
  return `<option value="${escapeHtml(value)}"${selectedValue === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function hasDocumentFilters(filters: WorkspaceDocumentFilters): boolean {
  return Boolean(filters.query || filters.status || filters.currentApproval);
}

function hasTemplateFilters(filters: WorkspaceTemplateFilters): boolean {
  return Boolean(filters.query || filters.lifecycle);
}

function statusLabel(status: string): string {
  const value = status.replaceAll("_", " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lifecycleLabel(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1).replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString().slice(0, 10);
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 19)}…${hash.slice(-8)}`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.intro{padding:3rem 0 2rem}.eyebrow{margin:0 0 .5rem}h1,h2{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.4rem,6vw,4.3rem);letter-spacing:-.04em}h2{margin:.2rem 0 .7rem;font-size:1.35rem}.lede{max-width:800px;font-size:1.08rem;color:var(--muted)}.metrics{display:grid;gap:1rem;margin-bottom:3rem}.metric,.record-card,.next,.empty,.filters{padding:1.3rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.metric p{margin:0;color:var(--muted)}.metric strong{display:block;font-size:2.2rem;line-height:1.15}.metric span{font-size:.9rem;color:var(--muted)}.next{display:grid;gap:1.4rem}.next p{color:var(--muted)}.actions{display:flex;gap:.7rem;flex-wrap:wrap}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:.65rem 1rem;border:2px solid var(--brand-primary);border-radius:.35rem;background:var(--brand-primary);color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.secondary{border-color:var(--brand-secondary);background:transparent;color:var(--text)}.filters{display:grid;gap:1rem;margin-bottom:1rem}.filter-field{display:grid;gap:.35rem}.filter-field label{font-weight:800}.filter-field input,.filter-field select{width:100%;min-height:44px;padding:.55rem .65rem;border:1px solid var(--border);border-radius:.35rem;background:var(--surface);color:var(--text);font:inherit}.filter-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}.filter-actions .button{margin:0}.filter-actions a{font-weight:800}.result-summary{margin:0 0 1rem;color:var(--muted)}.text-link{display:inline-block;margin-top:1rem;font-weight:800}.record-list{display:grid;gap:1rem}.record-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800}.badge.success{background:#d8f3e5;color:#0b5a36}.badge.warning{background:#fff0c7;color:#734500}.badge.neutral{background:var(--surface-muted);color:var(--text)}.facts{display:grid;gap:.6rem;margin:1rem 0}.facts div{display:grid;grid-template-columns:minmax(7rem,.4fr) 1fr;gap:1rem}.facts dt{font-weight:800}.facts dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.hash{margin:.8rem 0 0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}.empty{margin-bottom:3rem}.empty p{color:var(--muted)}@media(min-width:720px){.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.next{grid-template-columns:1fr auto;align-items:center}.filters{grid-template-columns:minmax(12rem,1fr) minmax(10rem,.6fr) minmax(10rem,.6fr) auto;align-items:end}.filters .grow{min-width:0}.filter-actions{padding-bottom:.05rem}}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:719px){.filters{grid-template-columns:1fr}}@media(max-width:600px){.header-inner,.record-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.facts div{grid-template-columns:1fr;gap:0}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}.badge.success{background:#103f2b;color:#a8ebca}.badge.warning{background:#4d3706;color:#ffe39b}.button.secondary{color:var(--text)}}`;
}
