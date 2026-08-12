import type {
  WorkQueueItem,
  WorkQueueKind,
} from "../application/review-approval-queue-read-service";
import type { ThemeConfig } from "./theme";

export function renderReviewApprovalQueue(
  theme: ThemeConfig,
  workspaceName: string,
  kind: WorkQueueKind,
  items: readonly WorkQueueItem[],
  notice?: string,
): string {
  const title = kind === "review" ? "Reviewer queue" : "Approver queue";
  const permission = kind === "review" ? "document.review" : "document.approve";
  const emptyCopy =
    kind === "review"
      ? "No current document versions are waiting for reviewer action."
      : "No current document versions are waiting for approval.";

  const records =
    items.length === 0
      ? `<section class="empty" aria-labelledby="empty-title">
          <p class="eyebrow">Queue clear</p>
          <h2 id="empty-title">${escapeHtml(emptyCopy)}</h2>
          <p>Only workflow instances bound to the document's exact current version can appear here.</p>
          <a class="button secondary" href="/demo/workflow">Advance the guided workflow</a>
        </section>`
      : `<div class="queue-list">${items.map((item) => renderQueueItem(item, kind)).join("")}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic authorization-gated review and approval work queue.">
  <title>${escapeHtml(title)} — ${escapeHtml(theme.appName)}</title>
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
      <span class="demo-label">Synthetic role queue · read-only UI</span>
    </div>
  </header>
  <div class="shell layout">
    <nav class="app-nav" aria-label="Workspace navigation">
      <p class="workspace-name">${escapeHtml(workspaceName)}</p>
      <a href="/demo/app">Overview</a>
      <a href="/demo/app/documents">Documents</a>
      <a href="/demo/app/templates">Templates</a>
      <a href="/demo/app/reviews" aria-current="page">Reviews &amp; Approvals</a>
      <hr>
      <a href="/demo/workflow">Guided workflow</a>
      <a href="/">Product overview</a>
    </nav>
    <main id="main">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">${escapeHtml(workspaceName)} · ${escapeHtml(permission)}</p>
        <h1 id="page-title">${escapeHtml(title)}</h1>
        <p class="lede">This queue is calculated from persisted workflow state. It excludes workflow instances for superseded document versions and, for approval work, versions that already have exact matching approval evidence.</p>
        ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      </section>
      <nav class="role-tabs" aria-label="Review and approval queues">
        <a href="/demo/app/reviews"${kind === "review" ? ' aria-current="page"' : ""}>Reviewer queue</a>
        <a href="/demo/app/approvals"${kind === "approval" ? ' aria-current="page"' : ""}>Approver queue</a>
      </nav>
      <p class="queue-summary"><strong>${items.length}</strong> ${items.length === 1 ? "item" : "items"} awaiting ${kind === "review" ? "review" : "approval"}.</p>
      ${records}
    </main>
  </div>
  <footer><div class="shell"><p>Synthetic authorized workspace by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderQueueItem(item: WorkQueueItem, kind: WorkQueueKind): string {
  return `<article class="queue-card">
    <div class="record-heading">
      <div>
        <p class="eyebrow">${escapeHtml(item.workflowState === "review" ? "Awaiting review" : "Awaiting approval")}</p>
        <h2>${escapeHtml(item.documentTitle)}</h2>
      </div>
      <span class="badge">Version ${item.versionNumber}</span>
    </div>
    <dl class="facts">
      <div><dt>Workflow</dt><dd>${escapeHtml(item.workflowDefinitionName)} · v${item.workflowDefinitionVersion}</dd></div>
      <div><dt>State since</dt><dd>${escapeHtml(formatTimestamp(item.workflowUpdatedAt))}</dd></div>
      <div><dt>Document status</dt><dd>${escapeHtml(statusLabel(item.documentStatus))}</dd></div>
      <div><dt>Current version</dt><dd>${item.versionNumber}</dd></div>
    </dl>
    <p class="hash">${escapeHtml(shortHash(item.contentHash))}</p>
    <a class="text-link" href="/demo/app/documents/${encodeURIComponent(item.documentId)}">View document evidence</a>
    ${renderQueueAction(item, kind)}
  </article>`;
}

function renderQueueAction(item: WorkQueueItem, kind: WorkQueueKind): string {
  if (kind === "review") {
    return `<section class="queue-action" aria-label="Review action for ${escapeHtml(item.documentTitle)}">
      <h3>Record review decision</h3>
      <form method="post" action="/demo/app/reviews/${encodeURIComponent(item.workflowInstanceId)}/decision">
        <label>Review comment <span>(required when requesting changes)</span>
          <textarea name="comment" maxlength="500" rows="3"></textarea>
        </label>
        <div class="action-row">
          <button type="submit" name="decision" value="accepted">Accept version ${item.versionNumber}</button>
          <button class="secondary-action" type="submit" name="decision" value="changes_requested">Request changes</button>
        </div>
      </form>
    </section>`;
  }

  return `<section class="queue-action" aria-label="Approval action for ${escapeHtml(item.documentTitle)}">
    <h3>Approve exact current version</h3>
    <form method="post" action="/demo/app/approvals/${encodeURIComponent(item.workflowInstanceId)}/approve">
      <label class="confirmation"><input type="checkbox" name="confirmApproval" value="yes" required> I confirm approval applies to exact current version ${item.versionNumber} and the hash shown above.</label>
      <button type="submit">Approve exact version ${item.versionNumber}</button>
    </form>
  </section>`;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--surface-raised)}.skip-link:focus{top:1rem}header,footer{background:var(--surface-raised);border-bottom:1px solid var(--border)}footer{margin-top:4rem;border-top:1px solid var(--border);border-bottom:0;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:1rem}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.15rem}.demo-label{font-size:.9rem;color:var(--muted)}.layout{display:grid;gap:2rem}.app-nav{display:flex;gap:.35rem;overflow-x:auto;padding:1rem 0;border-bottom:1px solid var(--border)}.app-nav a{padding:.55rem .7rem;border-radius:.35rem;text-decoration:none;white-space:nowrap}.app-nav a[aria-current="page"]{background:var(--brand-primary);color:#fff;font-weight:800}.app-nav hr,.workspace-name{display:none}.intro{padding:3rem 0 1.5rem}.eyebrow{margin:0 0 .5rem}h1,h2{line-height:1.15;text-wrap:balance}h1{margin:.2rem 0 1rem;font-size:clamp(2.4rem,6vw,4.3rem);letter-spacing:-.04em}h2{margin:.2rem 0 .7rem;font-size:1.35rem}.lede{max-width:800px;font-size:1.08rem;color:var(--muted)}.role-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}.role-tabs a{padding:.55rem .8rem;border:1px solid var(--border);border-radius:.35rem;background:var(--surface-raised);font-weight:800;text-decoration:none}.role-tabs a[aria-current="page"]{border-color:var(--brand-primary);background:var(--brand-primary);color:#fff}.queue-summary{margin:0 0 1.5rem;color:var(--muted)}.notice{margin:1rem 0 0;padding:.85rem 1rem;border-left:4px solid var(--brand-secondary);background:var(--surface-muted);font-weight:750}.queue-list{display:grid;gap:1rem}.queue-card,.empty{padding:1.3rem;border:1px solid var(--border);border-radius:.65rem;background:var(--surface-raised)}.record-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.badge{display:inline-flex;padding:.3rem .6rem;border-radius:999px;background:var(--surface-muted);font-size:.8rem;font-weight:800}.facts{display:grid;gap:.6rem;margin:1rem 0}.facts div{display:grid;grid-template-columns:minmax(8rem,.4fr) 1fr;gap:1rem}.facts dt{font-weight:800}.facts dd{margin:0;color:var(--muted);overflow-wrap:anywhere}.hash{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}.text-link{display:inline-block;margin-top:.5rem;font-weight:800}.queue-action{margin-top:1.25rem;padding-top:1.1rem;border-top:1px solid var(--border)}.queue-action h3{margin:.1rem 0 .75rem;font-size:1.05rem}.queue-action form{display:grid;gap:.8rem}.queue-action label{display:grid;gap:.35rem;font-weight:800}.queue-action label span{font-size:.82rem;font-weight:500;color:var(--muted)}.queue-action textarea{width:100%;min-height:5rem;padding:.65rem;border:1px solid var(--border);border-radius:.35rem;background:var(--surface);color:var(--text);font:inherit;resize:vertical}.confirmation{grid-template-columns:auto 1fr!important;align-items:start}.confirmation input{margin-top:.35rem}.action-row{display:flex;gap:.6rem;flex-wrap:wrap}.queue-action button{min-height:44px;padding:.6rem .9rem;border:2px solid var(--brand-primary);border-radius:.35rem;background:var(--brand-primary);color:#fff;font:inherit;font-weight:800;cursor:pointer}.queue-action button.secondary-action{background:transparent;color:var(--text)}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:.65rem 1rem;border:2px solid var(--brand-primary);border-radius:.35rem;background:var(--brand-primary);color:#fff;font-weight:800;text-decoration:none}.button.secondary{background:transparent;color:var(--text)}.empty p{color:var(--muted)}@media(min-width:900px){.layout{grid-template-columns:220px minmax(0,1fr)}.app-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:2rem 1rem 2rem 0;border-bottom:0}.app-nav hr{display:block;width:100%;border:0;border-top:1px solid var(--border)}.workspace-name{display:block;margin:0 0 .7rem;padding:.55rem .7rem;font-weight:800;color:var(--muted)}}@media(max-width:600px){.header-inner,.record-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.facts div{grid-template-columns:1fr;gap:0}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text:#f3f5f2;--muted:#c3d0d2;--border:#35545b;--focus:#f3a889}.button.secondary{color:var(--text)}}`;
}
