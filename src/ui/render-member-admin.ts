import { membershipStatusLabel } from "../application/member-admin-input";
import type {
  TenantMemberDirectory,
  TenantMemberRecord,
} from "../application/member-admin-service";
import type { ThemeConfig } from "./theme";

export function renderMemberAdmin(
  theme: ThemeConfig,
  directory: TenantMemberDirectory,
  actorSubjectId: string,
  notice?: string,
): string {
  const activeCount = directory.members.filter(
    (member) => member.status === "active",
  ).length;
  const stagedCount = directory.members.filter(
    (member) => member.status === "invited",
  ).length;
  const suspendedCount = directory.members.filter(
    (member) => member.status === "suspended",
  ).length;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic tenant member lifecycle administration.">
  <title>Members — ${escapeHtml(theme.appName)}</title>
  ${theme.faviconHref ? `<link rel="icon" href="${escapeHtml(theme.faviconHref)}" type="image/svg+xml">` : ""}
  <style>${styles(theme)}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header><div class="shell header-inner"><a class="wordmark" href="/demo/app"><span>${escapeHtml(theme.companyName)}</span><strong>${escapeHtml(theme.appName)}</strong></a><span class="demo-label">Synthetic Tenant Administrator</span></div></header>
  <main id="main" class="shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/demo/app">${escapeHtml(theme.terminology.workspace)}</a><span aria-hidden="true">/</span><a href="/demo/app/admin/settings">Administration</a><span aria-hidden="true">/</span><span>Members</span></nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Tenant membership</p>
      <h1 id="page-title">Members</h1>
      <p class="lede">Manage who belongs to <strong>${escapeHtml(directory.tenantName)}</strong> without coupling membership to a specific login provider. Direct members are application-local identities; future Microsoft Entra ID, Active Directory-connected, OIDC, or SAML provisioning can create or map members into the same tenant membership model.</p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      <p><a href="/demo/app/admin/access">Manage Roles &amp; Access</a></p>
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <p class="eyebrow">Provisioning boundary</p>
      <h2 id="boundary-title">Membership without pretending authentication exists</h2>
      <ul>
        <li><strong>Staged</strong> is the stored <code>invited</code> membership state. It means pre-provisioned only; this application does not send an invitation email.</li>
        <li><strong>Active</strong> means the member is authorization-eligible if an approved authentication mechanism resolves that identity.</li>
        <li><strong>Suspended</strong> immediately fails the existing active-membership authorization requirement while preserving role bindings and audit history.</li>
        <li>Directly created members use the internal <code>local</code> identity-provider marker but this slice stores no password, MFA secret, token, recovery code, or credential.</li>
        <li>Directory-backed identities remain provider-owned. Suspending an application membership does not modify Entra ID, Active Directory, OIDC, SAML, or another external provider.</li>
        <li>Members are not deleted here. Historical identity, role, workflow, approval, and audit references remain intact.</li>
      </ul>
    </section>

    <section class="stats" aria-label="Membership summary">
      <article><strong>${activeCount}</strong><span>Active</span></article>
      <article><strong>${stagedCount}</strong><span>Staged</span></article>
      <article><strong>${suspendedCount}</strong><span>Suspended</span></article>
    </section>

    <section class="panel" aria-labelledby="create-title">
      <div class="section-heading"><div><p class="eyebrow">Direct provisioning</p><h2 id="create-title">Add app-local member</h2></div><p>No email is sent</p></div>
      <form method="post" action="/demo/app/admin/members/create" class="create-form">
        <label>Display name
          <input name="displayName" required minlength="2" maxlength="100" autocomplete="off" placeholder="Jordan Smith">
        </label>
        <label>Email address
          <input name="email" type="email" required maxlength="254" autocomplete="off" placeholder="jordan@example.com">
        </label>
        <label>Initial membership
          <select name="initialStatus" required>
            <option value="invited">Staged — not authorization-eligible yet</option>
            <option value="active">Active — authorization-eligible</option>
          </select>
        </label>
        <button type="submit">Add member</button>
      </form>
    </section>

    <section class="panel" aria-labelledby="directory-title">
      <div class="section-heading"><div><p class="eyebrow">Tenant directory</p><h2 id="directory-title">Current members</h2></div><p>${directory.members.length} member${directory.members.length === 1 ? "" : "s"}</p></div>
      <div class="member-list">${directory.members.map((member) => renderMember(member, actorSubjectId)).join("")}</div>
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic member administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderMember(
  member: TenantMemberRecord,
  actorSubjectId: string,
): string {
  const roleCount =
    member.tenantRoleBindingCount + member.workspaceRoleBindingCount;
  const provider = providerLabel(member.provider);
  const action = renderAction(member, actorSubjectId);
  return `<article class="member-card">
    <div class="member-heading"><div><strong>${escapeHtml(member.displayName)}</strong>${member.email ? `<span>${escapeHtml(member.email)}</span>` : ""}</div><span class="status ${member.status}">${membershipStatusLabel(member.status)}</span></div>
    <dl>
      <div><dt>Identity source</dt><dd>${escapeHtml(provider)}</dd></div>
      <div><dt>Member since</dt><dd>${escapeHtml(member.createdAt)}</dd></div>
      <div><dt>Role bindings</dt><dd>${roleCount} total · ${member.tenantRoleBindingCount} tenant · ${member.workspaceRoleBindingCount} workspace</dd></div>
      <div><dt>Subject</dt><dd><code>${escapeHtml(member.subjectId)}</code></dd></div>
    </dl>
    <div class="actions">${action}</div>
  </article>`;
}

function renderAction(
  member: TenantMemberRecord,
  actorSubjectId: string,
): string {
  if (member.subjectId === actorSubjectId) {
    return '<p class="locked">Current administrator membership cannot be suspended from this screen.</p>';
  }
  if (member.status === "active") {
    return transitionForm(
      member.membershipId,
      "suspended",
      "Suspend member",
      true,
    );
  }
  return transitionForm(
    member.membershipId,
    "active",
    "Activate member",
    false,
  );
}

function transitionForm(
  membershipId: string,
  targetStatus: "active" | "suspended",
  label: string,
  secondary: boolean,
): string {
  return `<form method="post" action="/demo/app/admin/members/status">
    <input type="hidden" name="membershipId" value="${escapeHtml(membershipId)}">
    <input type="hidden" name="targetStatus" value="${targetStatus}">
    <button${secondary ? ' class="secondary"' : ""} type="submit">${escapeHtml(label)}</button>
  </form>`;
}

function providerLabel(provider: TenantMemberRecord["provider"]): string {
  if (provider === "local") return "App-local / direct";
  if (provider === "entra") return "Microsoft Entra ID";
  if (provider === "oidc") return "OIDC";
  if (provider === "saml") return "SAML";
  return "External / mapped";
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:900px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.boundary ul{margin-bottom:0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-block:1rem}.stats article{display:grid;background:var(--raised);border:1px solid var(--border);border-radius:14px;padding:1rem}.stats strong{font-size:1.9rem;color:var(--brand-primary)}.stats span{color:var(--muted)}.section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.section-heading p{margin:0;color:var(--muted)}.create-form{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:1rem;align-items:end}label{display:grid;gap:.4rem;font-weight:750;color:var(--brand-primary)}input,select,button{font:inherit;border-radius:10px;min-height:46px}input,select{width:100%;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:.65rem .75rem}button{border:0;background:var(--brand-primary);color:#fff;font-weight:800;padding:.65rem 1rem;cursor:pointer}.secondary{background:transparent;color:var(--brand-primary);border:1px solid var(--border)}.member-list{display:grid;gap:1rem}.member-card{border:1px solid var(--border);border-radius:14px;padding:1rem;background:var(--surface)}.member-heading{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.member-heading>div{display:grid;gap:.15rem}.member-heading span{color:var(--muted)}.status{border-radius:999px;padding:.25rem .6rem;font-size:.8rem;font-weight:850}.status.active{background:#d8f3e5;color:#0b5a36}.status.invited{background:#fff0c7;color:#684900}.status.suspended{background:var(--muted-surface);color:var(--muted)}dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin:1rem 0}dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}dd{margin:.15rem 0}.actions{display:flex;align-items:center;gap:.7rem}.actions form{margin:0}.locked{color:var(--muted)}code{overflow-wrap:anywhere}@media(max-width:900px){.create-form{grid-template-columns:1fr 1fr}.create-form button{width:100%}dl{grid-template-columns:1fr 1fr}}@media(max-width:650px){.header-inner,.member-heading,.section-heading{align-items:flex-start;flex-direction:column;padding-block:.5rem}.stats,.create-form,dl{grid-template-columns:1fr}.actions,.actions form,.actions button{width:100%}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}input,select{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.boundary h2,.panel h2,label,.stats strong,.secondary{color:#f1f5f2}.status.active{background:#103f2b;color:#a8ebca}.status.invited{background:#4f3d0b;color:#f6dc8e}button:not(.secondary){background:var(--brand-secondary)}}`;
}
