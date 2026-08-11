import type { WorkspaceWorkflowSelectionCatalog } from "../application/workspace-workflow-selection-service";
import type { ThemeConfig } from "./theme";

export function renderWorkspaceWorkflowSelection(
  theme: ThemeConfig,
  catalog: WorkspaceWorkflowSelectionCatalog,
  notice?: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic workspace workflow applicability and default selection.">
  <title>Workflow Selection — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header><div class="shell header-inner"><a class="wordmark" href="/demo/app"><span>${escapeHtml(theme.companyName)}</span><strong>${escapeHtml(theme.appName)}</strong></a><span class="demo-label">Synthetic Tenant Administrator</span></div></header>
  <main id="main" class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/demo/app">${escapeHtml(theme.terminology.workspace)}</a><span aria-hidden="true">/</span><a href="/demo/app/admin/settings">Administration</a><span aria-hidden="true">/</span><span>Workflow Selection</span></nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Workspace workflow policy</p>
      <h1 id="page-title">Workflow Selection</h1>
      <p class="lede">Choose which active workflow versions are available in <strong>${escapeHtml(catalog.workspaceName)}</strong> and which exact active version new workflow starts use by default.</p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      <p><a href="/demo/app/admin/workflows">Manage tenant Workflow Definitions and lifecycle</a></p>
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <p class="eyebrow">Selection boundary</p>
      <h2 id="boundary-title">Lifecycle changes availability, not history</h2>
      <ul>
        <li>Only <strong>Active</strong> versions can be newly made available or selected as a new default.</li>
        <li><strong>Deprecated</strong> versions may remain where already configured, including as an existing default, until administrators move away from them.</li>
        <li><strong>Retired</strong> versions cannot be assigned to a workspace or start a new workflow.</li>
        <li>The current default cannot be removed until another active applicable default is selected.</li>
        <li>Running workflow instances and recorded approvals remain bound to the exact version they started with.</li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="catalog-title">
      <div class="section-heading"><div><p class="eyebrow">Tenant definitions</p><h2 id="catalog-title">Available workflow versions</h2></div><p>${catalog.definitions.length} version${catalog.definitions.length === 1 ? "" : "s"}</p></div>
      ${catalog.definitions.length === 0 ? '<p class="empty">No workflow definitions exist for this tenant.</p>' : `<div class="definition-list">${catalog.definitions.map(renderDefinition).join("")}</div>`}
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic workspace workflow configuration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderDefinition(
  definition: WorkspaceWorkflowSelectionCatalog["definitions"][number],
): string {
  const selectionStatus = definition.isDefault
    ? '<span class="badge default">Workspace default</span>'
    : definition.applicable
      ? '<span class="badge enabled">Applicable</span>'
      : '<span class="badge neutral">Not applicable</span>';
  const lifecycleStatus = `<span class="badge lifecycle ${definition.lifecycleState}">${definition.lifecycleState[0]?.toUpperCase()}${definition.lifecycleState.slice(1)}</span>`;
  const action = renderActions(definition);

  return `<article class="definition-card">
    <div class="definition-heading"><div><strong>${escapeHtml(definition.name)}</strong><span><code>${escapeHtml(definition.workflowDefinitionId)}</code> · v${definition.workflowDefinitionVersion}</span></div><div class="badges">${lifecycleStatus}${selectionStatus}</div></div>
    <dl>
      <div><dt>Created</dt><dd>${escapeHtml(definition.createdAt)}</dd></div>
      <div><dt>Bound instances</dt><dd>${definition.instanceCount}</dd></div>
      <div><dt>States</dt><dd>${definition.states.length}</dd></div>
      <div><dt>Transitions</dt><dd>${definition.transitions.length}</dd></div>
    </dl>
    <div class="actions">${action}</div>
  </article>`;
}

function renderActions(
  definition: WorkspaceWorkflowSelectionCatalog["definitions"][number],
): string {
  if (definition.lifecycleState === "retired") {
    return '<p class="locked">Retired workflow versions are historical-only.</p>';
  }
  if (definition.lifecycleState === "deprecated") {
    if (!definition.applicable) {
      return '<p class="locked">Deprecated versions cannot be newly assigned. Reactivate this version in Workflow Definitions first.</p>';
    }
    if (definition.isDefault) {
      return '<p class="locked">This deprecated version remains the current default. Select an active applicable version as default before removing it.</p>';
    }
    return actionForm(definition, "disable", "Remove from workspace", true);
  }

  if (definition.applicable) {
    if (definition.isDefault) {
      return '<p class="locked">Select another applicable version as default before removing this one.</p>';
    }
    return `${actionForm(definition, "default", "Set as default")} ${actionForm(definition, "disable", "Remove from workspace", true)}`;
  }
  return actionForm(definition, "enable", "Make available");
}

function actionForm(
  definition: WorkspaceWorkflowSelectionCatalog["definitions"][number],
  action: "enable" | "disable" | "default",
  label: string,
  secondary = false,
): string {
  return `<form method="post" action="/demo/app/admin/workflow-selection/update">
    <input type="hidden" name="workflowDefinitionId" value="${escapeHtml(definition.workflowDefinitionId)}">
    <input type="hidden" name="workflowDefinitionVersion" value="${definition.workflowDefinitionVersion}">
    <input type="hidden" name="action" value="${action}">
    <button${secondary ? ' class="secondary"' : ""} type="submit">${escapeHtml(label)}</button>
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:850px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading p{margin:0;color:var(--muted)}.definition-list{display:grid;gap:1rem}.definition-card{border:1px solid var(--border);border-radius:14px;padding:1rem;background:var(--surface)}.definition-heading{display:flex;justify-content:space-between;gap:1rem}.definition-heading>div:first-child{display:grid;gap:.15rem}.badges{display:flex;gap:.4rem;align-items:flex-start;flex-wrap:wrap}.badge{align-self:flex-start;border-radius:999px;padding:.3rem .6rem;font-size:.8rem;font-weight:850}.badge.default{background:#d8f3e5;color:#0b5a36}.badge.enabled{background:var(--muted-surface);color:var(--brand-primary)}.badge.neutral{border:1px solid var(--border);color:var(--muted)}.badge.lifecycle.active{background:#d8f3e5;color:#0b5a36}.badge.lifecycle.deprecated{background:#fff0c7;color:#684900}.badge.lifecycle.retired{background:var(--muted-surface);color:var(--muted)}dl{display:flex;gap:1rem;flex-wrap:wrap}dl div{min-width:130px}dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}dd{margin:.15rem 0}.actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.actions form{margin:0}.locked,.empty{color:var(--muted)}button{min-height:42px;border:0;border-radius:10px;background:var(--brand-primary);color:white;font:inherit;font-weight:800;padding:.55rem .85rem;cursor:pointer}.secondary{background:transparent;color:var(--text);border:1px solid var(--border)}code{overflow-wrap:anywhere}@media(max-width:700px){.header-inner,.definition-heading,.section-heading{align-items:flex-start;flex-direction:column;padding-block:.5rem}.actions{align-items:stretch}.actions form,.actions button{width:100%}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}.wordmark strong,.intro h1,.boundary h2,.panel h2{color:#f1f5f2}.badge.default,.badge.lifecycle.active{background:#103f2b;color:#a8ebca}.badge.lifecycle.deprecated{background:#4f3d0b;color:#f6dc8e}.secondary{color:var(--text)}}`;
}
