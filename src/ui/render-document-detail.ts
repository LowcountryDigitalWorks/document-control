import type {
  DocumentAuditEvidence,
  DocumentDetailEvidence,
  DocumentVersionEvidence,
} from "../application/document-detail-read-service";
import type { ThemeConfig } from "./theme";

export function renderDocumentDetail(
  theme: ThemeConfig,
  detail: DocumentDetailEvidence,
  notice?: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic document evidence and audit detail.">
  <title>${escapeHtml(detail.title)} — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic evidence · controlled lifecycle</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(detail.workspaceName)}</p>
      <a href="/demo/app">Overview</a>
      <a href="/demo/app/documents" aria-current="page">Documents</a>
      <a href="/demo/app/templates">Templates</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">
      <p class="back"><a href="/demo/app/documents">← Back to Documents</a></p>
      <section class="intro" aria-labelledby="page-title">
        <div class="title-row">
          <div>
            <p class="eyebrow">Controlled document · ${escapeHtml(statusLabel(detail.status))}</p>
            <h1 id="page-title">${escapeHtml(detail.title)}</h1>
            <p class="lede">Version, workflow, approval, template provenance, and audit evidence assembled from persisted tenant-scoped records.</p>
          </div>
          ${renderCurrentStateBadge(detail)}
        </div>
        ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
        <p class="evidence-export"><a href="/demo/app/documents/${encodeURIComponent(detail.id)}/evidence.json">Download evidence manifest (JSON)</a></p>
      </section>

      ${renderDocumentRetirement(detail)}
      ${renderSourceTemplate(detail)}

      <section aria-labelledby="versions-title">
        <p class="eyebrow">Version evidence</p>
        <h2 id="versions-title">Approval stays with the exact version.</h2>
        <div class="version-list">${detail.versions.map(renderVersion).join("")}</div>
      </section>

      <section class="audit-section" aria-labelledby="audit-title">
        <p class="eyebrow">Append-only evidence</p>
        <h2 id="audit-title">Audit timeline</h2>
        ${renderAudit(detail.auditEvents)}
      </section>
    </main>
  </div>
  <footer><div class="shell"><p>Synthetic evidence view by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderDocumentRetirement(detail: DocumentDetailEvidence): string {
  if (detail.status === "retired") {
    return `<section class="panel retirement-panel" aria-labelledby="retirement-title">
      <p class="eyebrow">Controlled disposition</p>
      <h2 id="retirement-title">Retired historical record</h2>
      <p>This document is no longer operational. Its exact versions, approvals, workflows, source provenance, and audit evidence remain preserved and readable.</p>
    </section>`;
  }
  if (detail.status !== "approved") {
    return "";
  }
  return `<section class="panel retirement-panel" aria-labelledby="retirement-title">
    <p class="eyebrow">Controlled disposition</p>
    <h2 id="retirement-title">Retire this approved document</h2>
    <p>Retirement is terminal and non-destructive. It stops new versions and workflow activity but preserves all historical evidence. It does not delete content or enforce a retention schedule.</p>
    <form method="post" action="/demo/app/documents/${encodeURIComponent(detail.id)}/retire">
      <label class="confirmation"><input type="checkbox" name="confirmRetirement" value="yes" required> I understand this document will become historical-only.</label>
      <button type="submit">Retire document</button>
    </form>
  </section>`;
}

function renderCurrentStateBadge(detail: DocumentDetailEvidence): string {
  if (detail.status === "retired") {
    return '<span class="badge neutral">Retired · evidence preserved</span>';
  }
  return `<span class="badge ${currentApprovalApplies(detail) ? "success" : "warning"}">
    ${currentApprovalApplies(detail) ? "Current version approved" : "Current approval required"}
  </span>`;
}

function renderSourceTemplate(detail: DocumentDetailEvidence): string {
  const source = detail.sourceTemplate;
  if (!source) {
    return `<section class="panel" aria-labelledby="source-title">
      <p class="eyebrow">Source provenance</p>
      <h2 id="source-title">No approved template source recorded.</h2>
    </section>`;
  }

  return `<section class="panel" aria-labelledby="source-title">
    <p class="eyebrow">Source provenance</p>
    <div class="panel-heading">
      <div>
        <h2 id="source-title">${escapeHtml(source.name)}</h2>
        <p>Template version ${source.versionNumber} · ${escapeHtml(lifecycleLabel(source.lifecycleState))}</p>
      </div>
      <span class="badge neutral">Controlled source</span>
    </div>
    <dl class="facts">
      <div><dt>Template ID</dt><dd>${escapeHtml(source.id)}</dd></div>
      <div><dt>Provenance</dt><dd>${escapeHtml(source.provenance)}</dd></div>
      <div><dt>Source hash</dt><dd class="hash">${escapeHtml(source.contentHash)}</dd></div>
    </dl>
  </section>`;
}

function renderVersion(version: DocumentVersionEvidence): string {
  const approvals =
    version.approvals.length === 0
      ? '<p class="empty-note">No approval evidence exists for this version.</p>'
      : version.approvals
          .map(
            (approval) => `<div class="evidence-row">
              <strong>Approved by ${escapeHtml(approval.actorName)}</strong>
              <span>${escapeHtml(formatTimestamp(approval.approvedAt))}</span>
              <small>Workflow ${escapeHtml(approval.workflowDefinitionId)} v${approval.workflowDefinitionVersion}</small>
              <small class="hash">${escapeHtml(shortHash(approval.contentHash))}</small>
            </div>`,
          )
          .join("");

  const workflows =
    version.workflows.length === 0
      ? '<p class="empty-note">No workflow evidence exists for this version.</p>'
      : version.workflows
          .map(
            (workflow) => `<article class="workflow-card">
              <div class="workflow-heading">
                <div>
                  <strong>${escapeHtml(workflow.definitionName)} · v${workflow.definitionVersion}</strong>
                  <p>State: ${escapeHtml(statusLabel(workflow.state))}</p>
                </div>
                <span class="badge neutral">${workflow.reviews.length} review${workflow.reviews.length === 1 ? "" : "s"}</span>
              </div>
              ${
                workflow.reviews.length === 0
                  ? '<p class="empty-note">No review decision recorded.</p>'
                  : `<ul class="review-list">${workflow.reviews
                      .map(
                        (review) => `<li>
                          <strong>${escapeHtml(review.actorName)}</strong> · ${escapeHtml(statusLabel(review.decision))}
                          <span>${escapeHtml(formatTimestamp(review.createdAt))}</span>
                          ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ""}
                        </li>`,
                      )
                      .join("")}</ul>`
              }
            </article>`,
          )
          .join("");

  return `<article class="version-card">
    <div class="version-heading">
      <div>
        <p class="eyebrow">Version ${version.versionNumber}</p>
        <h3>${version.isCurrent ? "Current version" : "Historical version"}</h3>
        <p>Created by ${escapeHtml(version.createdByName)} · ${escapeHtml(formatTimestamp(version.createdAt))}</p>
        <p><strong>Change summary:</strong> ${escapeHtml(version.changeSummary)}</p>
      </div>
      <span class="badge ${version.exactApprovalApplies ? "success" : "warning"}">
        ${version.exactApprovalApplies ? "Exact approval applies" : "Approval required"}
      </span>
    </div>
    <p class="hash full-hash">${escapeHtml(version.contentHash)}</p>
    <div class="evidence-grid">
      <section aria-label="Approval evidence">
        <h4>Approval evidence</h4>
        ${approvals}
      </section>
      <section aria-label="Workflow and review evidence">
        <h4>Workflow &amp; reviews</h4>
        ${workflows}
      </section>
    </div>
  </article>`;
}

function renderAudit(events: readonly DocumentAuditEvidence[]): string {
  if (events.length === 0) {
    return '<p class="empty-note">No audit events have been recorded for this document.</p>';
  }

  return `<ol class="audit-list">${events
    .map(
      (event) => `<li>
        <div class="audit-marker" aria-hidden="true"></div>
        <div class="audit-content">
          <div class="audit-heading">
            <strong>${escapeHtml(eventLabel(event.eventType))}</strong>
            <time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(formatTimestamp(event.occurredAt))}</time>
          </div>
          <p>${escapeHtml(event.actorName)} · ${escapeHtml(event.entityType)}</p>
          ${renderAuditPayload(event.payload)}
        </div>
      </li>`,
    )
    .join("")}</ol>`;
}

function renderAuditPayload(
  payload: Readonly<Record<string, unknown>>,
): string {
  const entries = Object.entries(payload).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  );
  if (entries.length === 0) {
    return "";
  }
  return `<dl class="payload">${entries
    .slice(0, 6)
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(labelFromKey(key))}</dt><dd>${escapeHtml(String(value))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function currentApprovalApplies(detail: DocumentDetailEvidence): boolean {
  return detail.versions.some(
    (version) => version.isCurrent && version.exactApprovalApplies,
  );
}

function eventLabel(eventType: string): string {
  return eventType.split(".").map(labelFromKey).join(" · ");
}

function labelFromKey(value: string): string {
  const spaced = value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.back{margin:1.5rem 0 0}.intro{padding:2.3rem 0 2rem}.eyebrow{margin:0 0 .5rem}h1,h2,h3,h4{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.3rem,6vw,4.1rem);letter-spacing:-.04em}h2{margin:.2rem 0 1rem;font-size:clamp(1.6rem,4vw,2.2rem)}h3{margin:.2rem 0 .5rem;font-size:1.35rem}h4{margin:0 0 .7rem}.lede{max-width:780px;font-size:1.08rem;color:var(--muted)}.title-row,.panel-heading,.version-heading,.workflow-heading,.audit-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.panel,.version-card{margin-bottom:2.5rem;padding:1.3rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.notice{margin-top:1rem;padding:.85rem 1rem;border-left:4px solid var(--brand-secondary);background:var(--surface-muted);font-weight:750}.evidence-export{margin:1.25rem 0 0}.evidence-export a{font-weight:850}.retirement-panel form{display:grid;gap:.9rem;margin-top:1rem}.confirmation{display:flex;align-items:flex-start;gap:.65rem;font-weight:700}.confirmation input{width:1.1rem;height:1.1rem;margin-top:.25rem;flex:0 0 auto}.retirement-panel button{width:max-content;min-height:44px;border:0;border-radius:.45rem;padding:.65rem 1rem;background:var(--brand-primary);color:#fff;font:inherit;font-weight:800;cursor:pointer}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;font-size:.8rem;font-weight:800;white-space:nowrap}.badge.success{background:#d8f3e5;color:#0b5a36}.badge.warning{background:#fff0c7;color:#734500}.badge.neutral{background:var(--surface-muted);color:var(--text)}.facts,.payload{display:grid;gap:.6rem;margin:1rem 0 0}.facts div,.payload div{display:grid;grid-template-columns:minmax(8rem,.35fr) 1fr;gap:1rem}.facts dt,.payload dt{font-weight:800}.facts dd,.payload dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.hash{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}.full-hash{padding:.8rem;border-radius:.35rem;background:var(--surface-muted)}.version-list{margin-top:1.5rem}.evidence-grid{display:grid;gap:1rem;margin-top:1.2rem}.evidence-grid>section{padding:1rem;border:1px solid var(--border);border-radius:.5rem}.evidence-row{display:grid;gap:.15rem;padding:.7rem 0;border-top:1px solid var(--border)}.evidence-row:first-of-type{border-top:0}.evidence-row small,.evidence-row span,.workflow-card p,.empty-note{color:var(--muted)}.workflow-card{padding:.8rem 0;border-top:1px solid var(--border)}.workflow-card:first-of-type{border-top:0}.workflow-card p{margin:.25rem 0}.review-list{margin:.7rem 0 0;padding-left:1.2rem}.review-list li+li{margin-top:.7rem}.review-list span{display:block;color:var(--muted);font-size:.9rem}.review-list p{margin:.2rem 0 0}.audit-section{margin-top:3rem}.audit-list{list-style:none;margin:1.5rem 0 0;padding:0}.audit-list li{display:grid;grid-template-columns:18px 1fr;gap:.8rem;position:relative;padding-bottom:1.4rem}.audit-list li:not(:last-child)::before{content:"";position:absolute;left:7px;top:17px;bottom:0;width:2px;background:var(--border)}.audit-marker{width:16px;height:16px;margin-top:.3rem;border:3px solid var(--brand-secondary);border-radius:50%;background:var(--surface)}.audit-content{padding:0 0 .2rem}.audit-heading time{color:var(--muted);font-size:.9rem}.audit-content>p{margin:.2rem 0;color:var(--muted)}@media(min-width:760px){.evidence-grid{grid-template-columns:1fr 1fr}}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:650px){.header-inner,.title-row,.panel-heading,.version-heading,.workflow-heading,.audit-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.facts div,.payload div{grid-template-columns:1fr;gap:0}.badge{white-space:normal}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}.badge.success{background:#103f2b;color:#a8ebca}.badge.warning{background:#4d3706;color:#ffe39b}}`;
}
