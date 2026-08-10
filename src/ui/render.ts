import { approvalAppliesToVersion } from "../domain/approval";
import {
  syntheticApproval,
  syntheticDocument,
  syntheticTenant,
  syntheticVersionOne,
  syntheticVersionTwo,
  syntheticWorkspace,
} from "../demo/fixtures";
import type { ThemeConfig } from "./theme";

export function renderHome(theme: ThemeConfig): string {
  const appliesToVersionOne = approvalAppliesToVersion(
    syntheticApproval,
    syntheticVersionOne,
  );
  const appliesToVersionTwo = approvalAppliesToVersion(
    syntheticApproval,
    syntheticVersionTwo,
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A portable, tenant-aware document control foundation.">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(theme.appName)} — ${escapeHtml(theme.companyName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site-header">
    <div class="shell header-inner">
      <a class="wordmark" href="/" aria-label="${escapeHtml(theme.appName)} home">
        <span>${escapeHtml(theme.companyName)}</span>
        <strong>${escapeHtml(theme.appName)}</strong>
      </a>
      <span class="status"><span aria-hidden="true"></span> Synthetic demo</span>
    </div>
  </header>
  <main id="main">
    <section class="hero">
      <div class="shell hero-grid">
        <div>
          <p class="eyebrow">Portable document control</p>
          <h1>Approve the exact version. Keep the evidence.</h1>
          <p class="lede">A clean-room foundation for controlled documents, version-aware reviews, immutable approval evidence, and complete audit exports.</p>
          <a class="button" href="#demo">Start demo</a>
        </div>
        <aside class="principles" aria-labelledby="principles-title">
          <h2 id="principles-title">Built to remain yours</h2>
          <ul>
            <li>Tenant-scoped records</li>
            <li>Portable data and content</li>
            <li>Named, least-privilege roles</li>
            <li>No analytics or public uploads</li>
          </ul>
        </aside>
      </div>
    </section>
    <section class="section" id="demo" aria-labelledby="demo-title">
      <div class="shell">
        <p class="eyebrow">Synthetic tenant · ${escapeHtml(syntheticTenant.name)}</p>
        <div class="section-heading">
          <div>
            <h2 id="demo-title">${escapeHtml(syntheticDocument.title)}</h2>
            <p class="muted">${escapeHtml(syntheticWorkspace.name)} / Standard Operating Procedure</p>
          </div>
          <a class="text-link" href="/demo/export" download>Download application data</a>
        </div>
        <ol class="timeline" aria-label="Document lifecycle demonstration">
          <li class="complete">
            <span class="step">1</span>
            <div><strong>Template selected</strong><p>Approved template, version 1</p></div>
          </li>
          <li class="complete">
            <span class="step">2</span>
            <div><strong>Version 1 reviewed and approved</strong><p>Approval is bound to the exact version, content hash, actor, workflow version, and timestamp.</p></div>
          </li>
          <li class="warning">
            <span class="step">3</span>
            <div><strong>Version 2 created</strong><p>Content changed after approval. Version 2 requires a new review and approval.</p></div>
          </li>
          <li>
            <span class="step">4</span>
            <div><strong>Audit and export ready</strong><p>All synthetic events and application records are available in a versioned JSON export.</p></div>
          </li>
        </ol>
        <div class="evidence-grid">
          <article class="evidence-card approved">
            <p class="eyebrow">Version 1</p>
            <h3>Approval applies</h3>
            <p class="hash">${escapeHtml(shortHash(syntheticVersionOne.contentHash))}</p>
            <p><span class="badge success">${appliesToVersionOne ? "Exact match" : "Mismatch"}</span></p>
          </article>
          <article class="evidence-card changed">
            <p class="eyebrow">Version 2</p>
            <h3>Prior approval does not apply</h3>
            <p class="hash">${escapeHtml(shortHash(syntheticVersionTwo.contentHash))}</p>
            <p><span class="badge warning">${appliesToVersionTwo ? "Unexpected match" : "New approval required"}</span></p>
          </article>
        </div>
      </div>
    </section>
    <section class="section section-muted" aria-labelledby="foundation-title">
      <div class="shell">
        <p class="eyebrow">Foundation</p>
        <h2 id="foundation-title">Small, explicit, portable.</h2>
        <div class="cards">
          <article><h3>Cloudflare-native today</h3><p>Workers, D1, and R2 keep the first deployment compact and inexpensive.</p></article>
          <article><h3>Provider boundaries for tomorrow</h3><p>Database and content ports allow PostgreSQL and SharePoint adapters without changing core rules.</p></article>
          <article><h3>Append-only evidence</h3><p>Audit events describe what happened without mutable history rows.</p></article>
          <article><h3>Tenant-ready branding</h3><p>Names, colors, logos, and terminology come from configuration rather than domain logic.</p></article>
        </div>
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <div class="shell footer-inner">
      <p>Reference implementation by ${escapeHtml(theme.companyName)}</p>
      <p>No customer data. No tracking.</p>
    </div>
  </footer>
</body>
</html>`;
}

export function renderNotFound(theme: ThemeConfig): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found — ${escapeHtml(theme.appName)}</title><style>${styles(theme)}</style></head><body><main class="shell error"><p class="eyebrow">404</p><h1>That page is not here.</h1><p><a class="button" href="/">Return to the demo</a></p></main></body></html>`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--surface-raised:#fff;--surface-muted:#e8eee9;--text-primary:#102f38;--text-muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;--success:#157347;--warning:#965d00;--shadow:0 18px 45px rgb(16 47 56 / 10%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text-primary);background:var(--surface);font-synthesis:none}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;left:1rem;top:-6rem;z-index:100;padding:.7rem 1rem;background:var(--surface-raised);border:2px solid var(--text-primary)}.skip-link:focus{top:1rem}.site-header{border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface) 94%,transparent)}.header-inner,.footer-inner,.section-heading{display:flex;align-items:center;justify-content:space-between;gap:1.5rem}.header-inner{min-height:78px}.wordmark{display:inline-flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span{font-size:.72rem;text-transform:uppercase;letter-spacing:.16em;color:var(--text-muted)}.wordmark strong{font-size:1.2rem}.status{display:inline-flex;align-items:center;gap:.55rem;font-size:.9rem;color:var(--text-muted)}.status span{width:.65rem;height:.65rem;border-radius:50%;background:var(--brand-secondary)}.hero{padding:clamp(4rem,10vw,7.5rem) 0;background:linear-gradient(145deg,var(--surface) 35%,var(--surface-muted))}.hero-grid{display:grid;gap:3rem;align-items:center}.eyebrow{margin:0 0 .7rem;color:var(--brand-accent);font-size:.78rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h1,h2,h3{margin-top:0;line-height:1.12;text-wrap:balance}h1{max-width:780px;margin-bottom:1.2rem;font-size:clamp(2.65rem,8vw,5.4rem);letter-spacing:-.055em}h2{margin-bottom:1rem;font-size:clamp(1.9rem,5vw,3.2rem);letter-spacing:-.035em}h3{margin-bottom:.55rem;font-size:1.25rem}p{margin-top:0}.lede{max-width:720px;font-size:clamp(1.08rem,2vw,1.3rem);color:var(--text-muted)}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:1rem;padding:.75rem 1.1rem;border:2px solid var(--brand-accent);border-radius:.4rem;background:var(--brand-accent);color:#fff;font-weight:800;text-decoration:none}.button:hover{filter:brightness(.88)}.principles{padding:1.6rem;border:1px solid var(--border);border-radius:.65rem;background:color-mix(in srgb,var(--surface-raised) 84%,transparent);box-shadow:var(--shadow)}.principles h2{font-size:1.25rem;letter-spacing:0}.principles ul{margin:0;padding-left:1.25rem}.principles li+li{margin-top:.5rem}.section{padding:clamp(4rem,8vw,6.5rem) 0}.section-muted{background:var(--surface-muted)}.section-heading h2{margin-bottom:.3rem}.muted{color:var(--text-muted)}.text-link{font-weight:800;text-underline-offset:.25em}.timeline{display:grid;gap:0;margin:2.5rem 0;padding:0;list-style:none}.timeline li{position:relative;display:grid;grid-template-columns:44px 1fr;gap:1rem;padding-bottom:1.6rem}.timeline li:not(:last-child)::before{content:"";position:absolute;left:21px;top:42px;bottom:0;width:2px;background:var(--border)}.step{display:grid;width:44px;height:44px;place-items:center;border:2px solid var(--border);border-radius:50%;background:var(--surface-raised);font-weight:800}.complete .step{border-color:var(--success);color:var(--success)}.warning .step{border-color:var(--warning);color:var(--warning)}.timeline strong{display:block;margin:.2rem 0}.timeline p{margin:0;color:var(--text-muted)}.evidence-grid,.cards{display:grid;gap:1rem}.evidence-card,.cards article{padding:1.4rem;border:1px solid var(--border);border-radius:.55rem;background:var(--surface-raised)}.evidence-card.approved{border-top:5px solid var(--success)}.evidence-card.changed{border-top:5px solid var(--warning)}.hash{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--text-muted)}.badge{display:inline-flex;padding:.25rem .55rem;border-radius:999px;font-size:.82rem;font-weight:800}.badge.success{background:#d8f3e5;color:#0b5a36}.badge.warning{background:#fff0c7;color:#734500}.cards p{margin-bottom:0;color:var(--text-muted)}.site-footer{padding:1.8rem 0;border-top:1px solid var(--border);font-size:.9rem;color:var(--text-muted)}.site-footer p{margin:0}.error{min-height:70vh;padding-block:8rem}@media(min-width:760px){.hero-grid{grid-template-columns:minmax(0,1.65fr) minmax(280px,.65fr)}.evidence-grid,.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.header-inner,.footer-inner,.section-heading{align-items:flex-start;flex-direction:column}.header-inner{padding-block:1rem}.section-heading{gap:.5rem}}@media(prefers-color-scheme:dark){:root{--surface:#0f252c;--surface-raised:#17353d;--surface-muted:#132e35;--text-primary:#f3f5f2;--text-muted:#c3d0d2;--border:#35545b;--focus:#f3a889;--success:#75d6a6;--warning:#f6c863;--shadow:0 18px 45px rgb(0 0 0 / 24%)}.badge.success{background:#103f2b;color:#a8ebca}.badge.warning{background:#4d3706;color:#ffe39b}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}`;
}
