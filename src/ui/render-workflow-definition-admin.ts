import type { WorkflowGraphSummary } from "../application/workflow-authoring";
import type { WorkflowDefinitionInput } from "../application/workflow-definition-input";
import type {
  WorkflowDefinitionCatalog,
  WorkflowDefinitionRecord,
} from "../application/workflow-definition-admin-service";
import type { WorkflowLifecycleState } from "../domain/workflow-lifecycle";
import type { ThemeConfig } from "./theme";

export interface WorkflowAuthoringViewState {
  mode: "create" | "version";
  workflowDefinitionId?: string;
  sourceDefinition?: WorkflowDefinitionRecord;
  draft: WorkflowDefinitionInput;
  analysis: WorkflowGraphSummary;
}

export function renderWorkflowDefinitionAdmin(
  theme: ThemeConfig,
  catalog: WorkflowDefinitionCatalog,
  notice?: string,
  authoring?: WorkflowAuthoringViewState,
): string {
  const families = latestDefinitions(catalog);
  const createDraft =
    authoring?.mode === "create"
      ? authoring.draft
      : defaultDefinitionDraft("New document workflow");
  const versionDraft =
    authoring?.mode === "version"
      ? authoring.draft
      : defaultDefinitionDraft("Updated document workflow");
  const selectedFamilyId =
    authoring?.mode === "version" ? authoring.workflowDefinitionId : undefined;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic tenant workflow definition and lifecycle administration.">
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
      <p class="lede">Create immutable workflow versions and control whether an exact version is Active, Legacy, or Retired. Existing workflow instances stay bound to the exact definition version they started with.</p>
      <p><a href="/demo/app/admin/workflow-selection">Configure workspace applicability and default selection</a></p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <p class="eyebrow">Version and lifecycle boundary</p>
      <h2 id="boundary-title">Immutable content, controlled use</h2>
      <ul>
        <li>Workflow-definition content cannot be updated or deleted; structural changes create a new version.</li>
        <li><strong>Active</strong> versions may be newly assigned to workspaces and selected as defaults.</li>
        <li><strong>Legacy</strong> versions may continue where already configured, but cannot be newly assigned or newly selected as default. They can be returned to Active if needed.</li>
        <li><strong>Retired</strong> versions are historical-only. Remove every workspace assignment before retirement.</li>
        <li>Retirement never migrates running workflows or rewrites reviews, approvals, or audit evidence.</li>
      </ul>
    </section>

    <div class="forms-grid">
      <section class="panel" aria-labelledby="create-title">
        <p class="eyebrow">New family</p>
        <h2 id="create-title">Create workflow definition</h2>
        <form method="post" action="/demo/app/admin/workflows/create">
          ${definitionFields(createDraft)}
          ${authoring?.mode === "create" ? renderAnalysis(authoring.analysis) : ""}
          <div class="authoring-actions">
            <button type="submit">Create workflow v1</button>
            <button class="secondary" type="submit" formaction="/demo/app/admin/workflows/analyze" name="mode" value="create">Analyze draft</button>
          </div>
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
              ${families.map((definition) => `<option value="${escapeHtml(definition.id)}"${definition.id === selectedFamilyId ? " selected" : ""}>${escapeHtml(definition.name)} — latest v${definition.version}</option>`).join("")}
            </select>
          </label>
          ${authoring?.mode === "version" && authoring.sourceDefinition ? `<input type="hidden" name="sourceVersion" value="${authoring.sourceDefinition.version}"><p class="source-note"><strong>Starting point:</strong> ${escapeHtml(authoring.sourceDefinition.name)} v${authoring.sourceDefinition.version}. Saving creates a new immutable version; the source remains unchanged.</p>` : ""}
          ${definitionFields(versionDraft)}
          ${authoring?.mode === "version" ? renderAnalysis(authoring.analysis) : ""}
          <div class="authoring-actions">
            <button type="submit">Create next version</button>
            <button class="secondary" type="submit" formaction="/demo/app/admin/workflows/analyze" name="mode" value="version">Analyze draft</button>
          </div>
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

function definitionFields(draft: WorkflowDefinitionInput): string {
  return `<label>Workflow name
    <input name="name" required maxlength="100" value="${escapeHtml(draft.name)}" autocomplete="off">
  </label>
  <label>States <span>one identifier per line; first state is the initial state</span>
    <textarea name="states" required rows="6" spellcheck="false">${escapeHtml(draft.states.join("\n"))}</textarea>
  </label>
  <label>Transitions <span>one transition per line</span>
    <textarea name="transitions" rows="7" spellcheck="false">${escapeHtml(draft.transitions.map((transition) => `${transition.from} -> ${transition.to}`).join("\n"))}</textarea>
  </label>`;
}

function defaultDefinitionDraft(name: string): WorkflowDefinitionInput {
  return {
    name,
    states: ["draft", "review", "approval", "approved"],
    transitions: [
      { from: "draft", to: "review" },
      { from: "review", to: "draft" },
      { from: "review", to: "approval" },
      { from: "approval", to: "approved" },
    ],
  };
}

function renderAnalysis(analysis: WorkflowGraphSummary): string {
  const terminal =
    analysis.terminalStates.length === 0
      ? "None — this graph has no terminal state."
      : analysis.terminalStates.join(", ");
  const branching =
    analysis.branchingStates.length === 0
      ? "None"
      : analysis.branchingStates.join(", ");
  return `<section class="analysis" aria-label="Workflow draft analysis">
    <strong>Workflow draft analysis</strong>
    <dl>
      <div><dt>Initial state</dt><dd><code>${escapeHtml(analysis.initialState)}</code></dd></div>
      <div><dt>Reachable</dt><dd>${analysis.reachableStateCount} / ${analysis.totalStateCount} states</dd></div>
      <div><dt>Terminal states</dt><dd>${escapeHtml(terminal)}</dd></div>
      <div><dt>Branching states</dt><dd>${escapeHtml(branching)}</dd></div>
      <div><dt>Cycle present</dt><dd>${analysis.hasCycle ? "Yes" : "No"}</dd></div>
    </dl>
  </section>`;
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
      <div class="badges"><span class="version">v${definition.version}</span>${lifecycleBadge(definition.lifecycleState)}</div>
    </div>
    <dl>
      <div><dt>Created</dt><dd>${escapeHtml(definition.createdAt)}</dd></div>
      <div><dt>Lifecycle changed</dt><dd>${escapeHtml(definition.lifecycleChangedAt)}</dd></div>
      <div><dt>Workspace assignments</dt><dd>${definition.workspaceAssignmentCount}</dd></div>
      <div><dt>Bound instances</dt><dd>${definition.instanceCount}</dd></div>
    </dl>
    <div class="definition-grid">
      <div><h3>States</h3><p>${definition.states.map((state) => `<code>${escapeHtml(state)}</code>`).join(" ")}</p></div>
      <div><h3>Transitions</h3>${definition.transitions.length === 0 ? '<p class="empty">No transitions.</p>' : `<ul>${definition.transitions.map((transition) => `<li><code>${escapeHtml(transition.from)}</code> → <code>${escapeHtml(transition.to)}</code></li>`).join("")}</ul>`}</div>
    </div>
    <p class="source-action"><a href="/demo/app/admin/workflows?sourceId=${encodeURIComponent(definition.id)}&amp;sourceVersion=${definition.version}#version-title">Use v${definition.version} as a starting point for a new version</a></p>
    <div class="lifecycle-actions">${renderLifecycleActions(definition)}</div>
  </article>`;
}

function lifecycleLabel(state: WorkflowLifecycleState): string {
  if (state === "deprecated") return "Legacy";
  return `${state[0]?.toUpperCase()}${state.slice(1)}`;
}

function lifecycleBadge(state: WorkflowLifecycleState): string {
  return `<span class="badge ${state}">${lifecycleLabel(state)}</span>`;
}

function renderLifecycleActions(
  definition: WorkflowDefinitionCatalog["definitions"][number],
): string {
  if (definition.lifecycleState === "retired") {
    return '<p class="locked">Retired versions remain available only as historical evidence.</p>';
  }

  const actions = definition.availableLifecycleTransitions.map((target) =>
    lifecycleForm(definition.id, definition.version, target),
  );
  if (
    definition.lifecycleState === "deprecated" &&
    definition.workspaceAssignmentCount > 0
  ) {
    actions.push(
      '<p class="locked">Remove this Legacy version from every workspace before retiring it.</p>',
    );
  }
  return actions.join(" ");
}

function lifecycleForm(
  workflowDefinitionId: string,
  workflowDefinitionVersion: number,
  targetState: WorkflowLifecycleState,
): string {
  const labels: Record<WorkflowLifecycleState, string> = {
    active: "Return to Active",
    deprecated: "Mark Legacy",
    retired: "Retire",
  };
  return `<form method="post" action="/demo/app/admin/workflows/lifecycle">
    <input type="hidden" name="workflowDefinitionId" value="${escapeHtml(workflowDefinitionId)}">
    <input type="hidden" name="workflowDefinitionVersion" value="${workflowDefinitionVersion}">
    <input type="hidden" name="targetState" value="${targetState}">
    <button${targetState === "retired" ? ' class="secondary"' : ""} type="submit">${labels[targetState]}</button>
  </form>`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:850px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.forms-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.panel form{display:grid;gap:1rem;margin-top:1rem}label{display:grid;gap:.4rem;font-weight:750;color:var(--brand-primary)}label span{font-size:.85rem;font-weight:500;color:var(--muted)}input,select,textarea,button{font:inherit;border-radius:10px}input,select,textarea{width:100%;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:.65rem .75rem}input,select{min-height:46px}textarea{resize:vertical}button{min-height:46px;border:0;background:var(--brand-primary);color:white;font-weight:800;padding:.65rem 1rem;cursor:pointer}.secondary{background:transparent;color:var(--text);border:1px solid var(--border)}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading p{margin:0;color:var(--muted)}.definition-list{display:grid;gap:1rem}.definition-card{border:1px solid var(--border);border-radius:14px;padding:1rem;background:var(--surface)}.definition-heading{display:flex;justify-content:space-between;gap:1rem}.definition-heading>div:first-child{display:grid;gap:.15rem}.badges{display:flex;align-items:flex-start;gap:.45rem;flex-wrap:wrap}.version{font-weight:850;color:var(--brand-secondary)}.badge{border-radius:999px;padding:.25rem .55rem;font-size:.78rem;font-weight:850}.badge.active{background:#d8f3e5;color:#0b5a36}.badge.deprecated{background:#fff0c7;color:#684900}.badge.retired{background:var(--muted-surface);color:var(--muted)}dl{display:flex;gap:1rem;flex-wrap:wrap}dl div{min-width:150px}dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}dd{margin:.15rem 0}.definition-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.definition-grid h3{font-size:.9rem;margin:.3rem 0}.definition-grid p,.definition-grid ul{margin:.25rem 0}.definition-grid ul{padding-left:1.2rem}.authoring-actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap}.analysis{border:1px solid var(--border);border-radius:12px;padding:.85rem;background:var(--muted-surface)}.analysis dl{margin:.6rem 0 0}.source-note,.source-action{color:var(--muted)}.source-action{margin:.8rem 0 0}.lifecycle-actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.lifecycle-actions form{margin:0}.locked,.empty{color:var(--muted)}code{overflow-wrap:anywhere}@media(max-width:760px){.header-inner,.definition-heading,.section-heading{align-items:flex-start;flex-direction:column;padding-block:.5rem}.forms-grid,.definition-grid{grid-template-columns:1fr}.authoring-actions,.lifecycle-actions{align-items:stretch}.authoring-actions button,.lifecycle-actions form,.lifecycle-actions button{width:100%}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}input,select,textarea{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.boundary h2,.panel h2,label{color:#f1f5f2}button{background:var(--brand-secondary)}.secondary{color:var(--text)}.badge.active{background:#103f2b;color:#a8ebca}.badge.deprecated{background:#4f3d0b;color:#f6dc8e}}`;
}
