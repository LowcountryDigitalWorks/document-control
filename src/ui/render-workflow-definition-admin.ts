import type { WorkflowDefinitionCatalog } from "../application/workflow-definition-admin-service";
import type { ThemeConfig } from "./theme";

export function renderWorkflowDefinitionAdmin(
  theme: ThemeConfig,
  catalog: WorkflowDefinitionCatalog,
  notice?: string,
): string {
  const families = latestDefinitions(catalog);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic tenant workflow definition administration.">
  <title>Workflow Definitions — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <div class="shell header-inner">
      <a class="wordmark" href="/demo/app"><span>${escapeHtml(theme.companyName)}</span><strong>${escapeHtml(theme.appName)}</strong></a>
      <span class="demo-label">Synthetic Tenant Administrator</span>
    </div>
  </header>
  <main id="main" class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/demo/app">${escapeHtml(theme.terminology.workspace)}</a><span aria-hidden="true">/</span>
      <a href="/demo/app/admin/settings">Administration</a><span aria-hidden="true">/</span>
      <span>Workflow Definitions</span>
    </nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Tenant workflow catalog</p>
      <h1 id="page-title">Workflow Definitions</h1>
      <p class="lede">Create a new tenant workflow family or append a new immutable version. Existing workflow instances stay bound to the exact definition version they started with.</p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <p class="eyebrow">Versioning boundary</p>
      <h2 id="boundary-title">New version, never in-place edit</h2>
      <ul>
        <li>Existing workflow-definition rows cannot be updated or deleted after this release.</li>
        <li>A new version keeps the same definition ID and receives the next positive version number.</li>
        <li>States use bounded lowercase identifiers; transitions use <code>from_state -&gt; to_state</code>.</li>
        <li>This catalog is tenant-wide, so definition administration requires Tenant Administrator authority plus <code>workflow.manage</code>.</li>
        <li>This slice does not automatically select a new definition for documents or migrate running workflows.</li>
      </ul>
    </section>

    <div class="forms-grid">
      <section class="panel" aria-labelledby="create-title">
        <p class="eyebrow">New family</p>
        <h2 id="create-title">Create workflow definition</h2>
        <form method="post" action="/demo/app/admin/workflows/create">
          ${definitionFields("New document workflow")}
          <button type="submit">Create workflow v1</button>
        </form>
      </section>

      <section class="panel" aria-labelledby="version-title">
        <p class="eyebrow">Immutable revision</p>
        <h2 id="version-title">Create next version</h2>
        ${
          families.length === 0
            ? '<p class="empty">No workflow families exist yet.</p>'
            : `<form method="post" action="/demo/app/admin/workflows/version">
          <label>Existing workflow family
            <select name="workflowDefinitionId" required>
              <option value="">Select a workflow family</option>
              ${families.map((definition) => `<option value="${escapeHtml(definition.id)}">${escapeHtml(definition.name)} — latest v${definition.version}</option>`).join("")}
            </select>
          </label>
          ${definitionFields("Updated document workflow")}
          <button type="submit">Create next version</button>
        </form>`
        }
      </section>
    </div>

    <section class="panel" aria-labelledby="catalog-title">
      <div class="section-heading">
        <div><p class="eyebrow">Immutable history</p><h2 id="catalog-title">Definition versions</h2></div>
        <p>${catalog.definitions.length} version${catalog.definitions.length === 1 ? "" : "s"}</p>
      </div>
      ${catalog.definitions.length === 0 ? '<p class="empty">No workflow definitions are currently recorded.</p>' : `<div class="definition-list">${catalog.definitions.map(renderDefinition).join("")}</div>`}
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic workflow administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function definitionFields(defaultName: string): string {
  return `<label>Workflow name
    <input name="name" required maxlength="100" value="${escapeHtml(defaultName)}" autocomplete="off">
  </label>
  <label>States <span>one identifier per line; first state is the initial state</span>
    <textarea name="states" required rows="6" spellcheck="false">draft
review
approval
approved</textarea>
  </label>
  <label>Transitions <span>one transition per line</span>
    <textarea name="transitions" rows="7" spellcheck="false">draft -> review
review -> draft
review -> approval
approval -> approved</textarea>
  </label>`;
}

function latestDefinitions(
  catalog: WorkflowDefinitionCatalog,
): WorkflowDefinitionCatalog["definitions"] {
  const seen = new Set<string>();
  return catalog.definitions.filter((definition) => {
    if (seen.has(definition.id)) return false;
    seen.add(definition.id);
    return true;
  });
}

function renderDefinition(
  definition: WorkflowDefinitionCatalog["definitions"][number],
): string {
  return `<article class="definition-card">
    <div class="definition-heading">
      <div><strong>${escapeHtml(definition.name)}</strong><span><code>${escapeHtml(definition.id)}</code></span></div>
      <span class="version">v${definition.version}</span>
    </div>
    <dl>
      <div><dt>Created</dt><dd>${escapeHtml(definition.createdAt)}</dd></div>
      <div><dt>Bound instances</dt><dd>${definition.instanceCount}</dd></div>
    </dl>
    <div class="definition-grid">
      <div><h3>States</h3><p>${definition.states.map((state) => `<code>${escapeHtml(state)}</code>`).join(" ")}</p></div>
      <div><h3>Transitions</h3>${definition.transitions.length === 0 ? '<p class="empty">No transitions.</p>' : `<ul>${definition.transitions.map((transition) => `<li><code>${escapeHtml(transition.from)}</code> → <code>${escapeHtml(transition.to)}</code></li>`).join("")}</ul>`}</div>
    </div>
  </article>`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:850px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.forms-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.panel form{display:grid;gap:1rem;margin-top:1rem}label{display:grid;gap:.4rem;font-weight:750;color:var(--brand-primary)}label span{font-size:.85rem;font-weight:500;color:var(--muted)}input,select,textarea,button{font:inherit;border-radius:10px}input,select,textarea{width:100%;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:.65rem .75rem}input,select{min-height:46px}textarea{resize:vertical}button{min-height:46px;border:0;background:var(--brand-primary);color:white;font-weight:800;padding:.65rem 1rem;cursor:pointer}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading p{margin:0;color:var(--muted)}.definition-list{display:grid;gap:1rem}.definition-card{border:1px solid var(--border);border-radius:14px;padding:1rem;background:var(--surface)}.definition-heading{display:flex;justify-content:space-between;gap:1rem}.definition-heading div{display:grid;gap:.15rem}.version{font-weight:850;color:var(--brand-secondary)}dl{display:flex;gap:1rem;flex-wrap:wrap}dl div{min-width:150px}dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}dd{margin:.15rem 0}.definition-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.definition-grid h3{font-size:.9rem;margin:.3rem 0}.definition-grid p,.definition-grid ul{margin:.25rem 0}.definition-grid ul{padding-left:1.2rem}.empty{color:var(--muted)}code{overflow-wrap:anywhere}@media(max-width:760px){.header-inner{align-items:flex-start;flex-direction:column;padding-block:1rem}.forms-grid,.definition-grid{grid-template-columns:1fr}.section-heading{align-items:flex-start;flex-direction:column}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}input,select,textarea{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.boundary h2,.panel h2,label{color:#f1f5f2}button{background:var(--brand-secondary)}}`;
}
