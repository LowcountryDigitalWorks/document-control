import type { GuidedDemoState } from "../demo/workflow-demo";
import type { ThemeConfig } from "./theme";

export function renderGuidedDemo(
  theme: ThemeConfig,
  state: GuidedDemoState,
): string {
  const actor = actorForPhase(state.phase);
  const versions =
    state.versions.length === 0
      ? '<p class="empty">No document version exists yet. The approved template is ready.</p>'
      : `<div class="versions">${state.versions
          .map(
            (version) => `<article class="version-card">
              <div class="version-heading">
                <div>
                  <p class="eyebrow">Version ${version.versionNumber}</p>
                  <h3>${version.versionNumber === state.currentVersionNumber ? "Current version" : "Historical version"}</h3>
                </div>
                <span class="badge ${version.exactApprovalApplies ? "success" : "warning"}">
                  ${version.exactApprovalApplies ? "Exact approval applies" : "Approval required"}
                </span>
              </div>
              <p class="hash">${escapeHtml(shortHash(version.contentHash))}</p>
            </article>`,
          )
          .join("")}</div>`;

  const action =
    state.nextAction && state.nextActionLabel
      ? `<form method="post" action="/demo/workflow/actions/${state.nextAction}" class="action-card">
          <div>
            <p class="eyebrow">Next controlled action</p>
            <h2>${escapeHtml(state.nextActionLabel)}</h2>
            <p>For this synthetic scenario, the server assigns <strong>${escapeHtml(actor)}</strong>. The browser does not choose a tenant, user, role, or permission.</p>
          </div>
          <button type="submit">${escapeHtml(state.nextActionLabel)}</button>
        </form>`
      : `<section class="action-card complete" aria-labelledby="complete-title">
          <div>
            <p class="eyebrow">Demonstration complete</p>
            <h2 id="complete-title">The prior approval stayed with version 1.</h2>
            <p>Version 2 is now current and requires its own review and approval. Historical approval evidence was not copied forward.</p>
          </div>
          <a class="button secondary" href="/">Return to overview</a>
        </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Guided synthetic document-control workflow demonstration.">
  <meta name="color-scheme" content="light dark">
  <title>Guided workflow demo — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic · server-controlled identities</span>
    </div>
  </header>
  <main id="main" class="shell">
    <nav aria-label="Breadcrumb"><a href="/">Overview</a> <span aria-hidden="true">/</span> Guided workflow</nav>
    <section class="intro" aria-labelledby="demo-title">
      <p class="eyebrow">${escapeHtml(state.tenantName)} · ${escapeHtml(state.workspaceName)}</p>
      <h1 id="demo-title">Walk one document through control.</h1>
      <p class="lede">This local/test-only guided path uses the real persisted workflow and authorization services with synthetic identities. It accepts no uploads and no user-selected authority values.</p>
    </section>

    <section class="summary" aria-labelledby="state-title">
      <div>
        <p class="eyebrow">Controlled document</p>
        <h2 id="state-title">${escapeHtml(state.documentTitle)}</h2>
        <p>${escapeHtml(state.templateName)} · phase <strong>${escapeHtml(phaseLabel(state.phase))}</strong>${state.documentStatus ? ` · status <strong>${escapeHtml(state.documentStatus)}</strong>` : ""}</p>
      </div>
      <div class="control-note">
        <strong>Authorization boundary active</strong>
        <p>Actions are checked against configurable role permissions at the tenant/workspace/resource scope before persistence runs.</p>
      </div>
    </section>

    <section aria-labelledby="versions-title">
      <p class="eyebrow">Version evidence</p>
      <h2 id="versions-title">Approval follows the exact bytes, not the document name.</h2>
      ${versions}
    </section>

    ${action}

    <section class="guardrails" aria-labelledby="guardrails-title">
      <p class="eyebrow">Demo guardrails</p>
      <h2 id="guardrails-title">What this path deliberately cannot do</h2>
      <ul>
        <li>No arbitrary file or customer-data upload.</li>
        <li>No browser-supplied subject, tenant, role, or permission.</li>
        <li>No production login, session, OIDC, SAML, or Entra claim.</li>
        <li>No production deployment or shared public-demo session.</li>
      </ul>
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic workflow demonstration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function actorForPhase(phase: GuidedDemoState["phase"]): string {
  if (phase === "review") {
    return "Riley Reviewer (Reviewer)";
  }
  if (phase === "approval") {
    return "Alex Approver (Approver)";
  }
  return "Avery Author (Author)";
}

function phaseLabel(phase: GuidedDemoState["phase"]): string {
  const labels: Record<GuidedDemoState["phase"], string> = {
    ready: "Template ready",
    created: "Draft created",
    review: "In review",
    approval: "Awaiting approval",
    approved: "Version 1 approved",
    changed: "Version 2 changed",
  };
  return labels[phase];
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;--success:#157347;--warning:#965d00;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1000px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{border-bottom:1px solid var(--border);background:var(--surface-raised)}footer{margin-top:5rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}nav{padding-top:1.5rem;color:var(--muted)}nav span{padding-inline:.4rem}.intro{padding:4rem 0 3rem}.eyebrow{margin:0 0 .6rem}h1,h2,h3{line-height:1.15;text-wrap:balance}h1{max-width:800px;margin:.2rem 0 1rem;font-size:clamp(2.5rem,7vw,4.8rem);letter-spacing:-.045em}h2{margin:.2rem 0 .8rem;font-size:clamp(1.6rem,4vw,2.4rem)}h3{margin:.2rem 0;font-size:1.15rem}.lede{max-width:760px;font-size:1.15rem;color:var(--muted)}.summary{display:grid;gap:1rem;margin-bottom:4rem;padding:1.5rem;border:1px solid var(--border);border-radius:.7rem;background:var(--surface-raised)}.summary p{margin-bottom:0}.control-note{padding:1rem;border-left:4px solid var(--brand-secondary);background:var(--surface-muted)}.control-note p{margin:.3rem 0 0;color:var(--muted)}.versions{display:grid;gap:1rem;margin:1.5rem 0 4rem}.version-card{padding:1.3rem;border:1px solid var(--border);border-radius:.6rem;background:var(--surface-raised)}.version-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.hash{margin:.8rem 0 0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800}.badge.success{background:#d8f3e5;color:#0b5a36}.badge.warning{background:#fff0c7;color:#734500}.empty{margin:1.5rem 0 4rem;padding:1.3rem;border:1px dashed var(--border);color:var(--muted)}.action-card{display:grid;gap:1.5rem;margin:2rem 0 4rem;padding:1.6rem;border:2px solid var(--brand-secondary);border-radius:.7rem;background:var(--surface-raised)}.action-card p{margin-bottom:0;color:var(--muted)}button,.button{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:.7rem 1rem;border:2px solid var(--brand-accent);border-radius:.4rem;background:var(--brand-accent);color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.secondary{border-color:var(--brand-primary);background:var(--brand-primary)}.guardrails{padding:2rem;border-radius:.7rem;background:var(--surface-muted)}.guardrails ul{margin-bottom:0;padding-left:1.3rem}.guardrails li+li{margin-top:.4rem}@media(min-width:720px){.summary{grid-template-columns:1.3fr .7fr}.versions{grid-template-columns:repeat(2,minmax(0,1fr))}.action-card{grid-template-columns:1fr auto;align-items:center}}@media(max-width:600px){.header-inner,.version-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889;--success:#75d6a6;--warning:#f6c863}.badge.success{background:#103f2b;color:#a8ebca}.badge.warning{background:#4d3706;color:#ffe39b}}`;
}
