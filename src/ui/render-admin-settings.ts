import type { PresentationSettingsSnapshot } from "../application/presentation-settings-service";
import type { ThemeConfig } from "./theme";

export function renderAdminSettings(
  theme: ThemeConfig,
  settings: PresentationSettingsSnapshot,
  saved: boolean,
): string {
  const branding = settings.branding;
  const terminology = settings.terminology;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic tenant presentation administration.">
  <title>Administration — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <div class="shell header-inner">
      <a class="wordmark" href="/demo/app">
        <span>${escapeHtml(theme.companyName)}</span>
        <strong>${escapeHtml(theme.appName)}</strong>
      </a>
      <span class="demo-label">Synthetic Tenant Administrator</span>
    </div>
  </header>
  <main id="main" class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/demo/app">${escapeHtml(theme.terminology.workspace)}</a>
      <span aria-hidden="true">/</span>
      <span>Administration</span>
    </nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Tenant and workspace presentation</p>
      <h1 id="page-title">Administration</h1>
      <p class="lede">Configure the synthetic tenant's workspace name, application presentation, and document-control terminology. These values are persisted in the existing tenant configuration model and applied to the tenant UI after validation.</p>
      ${saved ? '<p class="notice" role="status">Presentation settings saved.</p>' : ""}
      <p><a href="/demo/app/admin/access"><strong>Manage Roles &amp; Access</strong></a> · <a href="/demo/app/admin/workflows">Workflow Definitions</a> · <a href="/demo/app/admin/backup">Backup &amp; Portability</a></p>
    </section>

    <section class="context" aria-labelledby="context-title">
      <div>
        <p class="eyebrow">Configuration boundary</p>
        <h2 id="context-title">Current tenant</h2>
      </div>
      <dl>
        <div><dt>Tenant</dt><dd>${escapeHtml(settings.tenantName)}</dd></div>
        <div><dt>Tenant slug</dt><dd><code>${escapeHtml(settings.tenantSlug)}</code></dd></div>
        <div><dt>Permitted data profile</dt><dd><strong>${escapeHtml(profileLabel(settings.permittedDataProfile))}</strong></dd></div>
        <div><dt>Last configuration update</dt><dd>${escapeHtml(settings.updatedAt)}</dd></div>
      </dl>
      <p class="boundary">The permitted-data profile is intentionally read-only on this screen. Changing regulatory/data-handling authorization requires a separate approved deployment decision.</p>
    </section>

    <form method="post" action="/demo/app/admin/settings" class="settings-form">
      <section class="panel" aria-labelledby="workspace-settings-title">
        <div>
          <p class="eyebrow">Workspace</p>
          <h2 id="workspace-settings-title">Workspace identity</h2>
          <p>Rename the current synthetic workspace without changing its stable identifier.</p>
        </div>
        <label>
          Workspace name
          <input name="workspaceName" required maxlength="80" value="${escapeHtml(settings.workspaceName)}" autocomplete="off">
        </label>
      </section>

      <section class="panel" aria-labelledby="brand-settings-title">
        <div>
          <p class="eyebrow">Branding</p>
          <h2 id="brand-settings-title">Application presentation</h2>
          <p>Colors accept only six-digit hexadecimal values. This slice does not accept logo uploads or external logo URLs.</p>
        </div>
        <div class="grid two">
          ${textField("Application name", "appName", configured(branding.appName, theme.appName), 80)}
          ${textField("Company name", "companyName", configured(branding.companyName, theme.companyName), 100)}
        </div>
        <div class="grid three">
          ${colorField("Primary color", "primary", configured(branding.primary, theme.primary))}
          ${colorField("Secondary color", "secondary", configured(branding.secondary, theme.secondary))}
          ${colorField("Accent color", "accent", configured(branding.accent, theme.accent))}
        </div>
      </section>

      <section class="panel" aria-labelledby="terms-settings-title">
        <div>
          <p class="eyebrow">Terminology</p>
          <h2 id="terms-settings-title">Tenant vocabulary</h2>
          <p>Use familiar labels without changing the underlying document-control domain model.</p>
        </div>
        <div class="grid three">
          ${textField("Workspace term", "workspaceTerm", configured(terminology.workspace, theme.terminology.workspace), 40)}
          ${textField("Document term", "documentTerm", configured(terminology.document, theme.terminology.document), 40)}
          ${textField("Approval term", "approvalTerm", configured(terminology.approval, theme.terminology.approval), 40)}
        </div>
      </section>

      <div class="form-actions">
        <button class="button" type="submit">Save presentation settings</button>
        <a href="/demo/app">Cancel</a>
      </div>
    </form>

    <section class="preview" aria-labelledby="preview-title">
      <p class="eyebrow">Current applied theme</p>
      <h2 id="preview-title">Runtime preview</h2>
      <div class="preview-card">
        <span class="swatch primary" aria-label="Primary color"></span>
        <span class="swatch secondary" aria-label="Secondary color"></span>
        <span class="swatch accent" aria-label="Accent color"></span>
        <div>
          <strong>${escapeHtml(theme.companyName)} · ${escapeHtml(theme.appName)}</strong>
          <p>${escapeHtml(theme.terminology.workspace)} · ${escapeHtml(theme.terminology.document)} · ${escapeHtml(theme.terminology.approval)}</p>
        </div>
      </div>
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function textField(
  label: string,
  name: string,
  value: string,
  maximumLength: number,
): string {
  return `<label>
    ${escapeHtml(label)}
    <input name="${escapeHtml(name)}" required maxlength="${maximumLength}" value="${escapeHtml(value)}" autocomplete="off">
  </label>`;
}

function colorField(label: string, name: string, value: string): string {
  return `<label>
    ${escapeHtml(label)}
    <span class="color-input"><input name="${escapeHtml(name)}" required maxlength="7" pattern="#[0-9A-Fa-f]{6}" value="${escapeHtml(value)}" autocomplete="off"><span class="color-chip" style="background:${escapeHtml(value)}" aria-hidden="true"></span></span>
  </label>`;
}

function configured(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function profileLabel(value: string): string {
  if (value === "demo_synthetic") return "Synthetic demo only";
  if (value === "ordinary_business") return "Ordinary business data";
  if (value === "regulated_approved")
    return "Regulated — explicitly approved deployment";
  return value;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.6;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1040px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:760px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.context,.panel,.preview{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.7rem);margin-block:1rem}.context h2,.panel h2,.preview h2{margin:.1rem 0 .4rem;color:var(--brand-primary)}.context dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem 1.2rem}.context dl div{padding:.8rem;background:var(--surface);border-radius:12px}.context dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:800}.context dd{margin:.2rem 0 0}.boundary{color:var(--muted);margin-bottom:0}.settings-form{margin-top:2rem}.panel>div:first-child{margin-bottom:1rem}.panel p{color:var(--muted);margin-top:.25rem}.grid{display:grid;gap:1rem}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}label{display:grid;gap:.4rem;font-weight:750;color:var(--brand-primary)}input{width:100%;min-height:46px;border:1px solid var(--border);border-radius:10px;padding:.65rem .75rem;font:inherit;color:var(--text);background:var(--surface)}.color-input{display:flex;align-items:center;gap:.5rem}.color-chip,.swatch{display:inline-block;width:2rem;height:2rem;border-radius:50%;border:1px solid var(--border);flex:none}.form-actions{display:flex;align-items:center;gap:1rem;margin:1.3rem 0 2.4rem}.button{appearance:none;border:0;border-radius:999px;background:var(--brand-primary);color:white;font:inherit;font-weight:800;padding:.8rem 1.2rem;cursor:pointer}.preview-card{display:flex;align-items:center;gap:.65rem;background:var(--surface);padding:1rem;border-radius:14px}.preview-card div{margin-left:.4rem}.preview-card p{margin:.2rem 0 0;color:var(--muted)}.swatch.primary{background:var(--brand-primary)}.swatch.secondary{background:var(--brand-secondary)}.swatch.accent{background:var(--brand-accent)}code{overflow-wrap:anywhere}@media(max-width:720px){.grid.two,.grid.three,.context dl{grid-template-columns:1fr}.header-inner{align-items:flex-start;flex-direction:column;padding-block:1rem}.form-actions{align-items:flex-start;flex-direction:column}.preview-card{align-items:flex-start;flex-wrap:wrap}.preview-card div{flex-basis:100%;margin-left:0}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}input{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.context h2,.panel h2,.preview h2,label{color:#f1f5f2}.button{background:var(--brand-secondary)}}`;
}
