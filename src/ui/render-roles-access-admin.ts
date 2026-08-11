import {
  customWorkspaceRolePermissions,
  type AccessRoleDefinition,
  type WorkspaceAccessSnapshot,
} from "../application/roles-access-admin-service";
import type { ThemeConfig } from "./theme";

export function renderRolesAccessAdmin(
  theme: ThemeConfig,
  snapshot: WorkspaceAccessSnapshot,
  notice?: string,
): string {
  const activeMembers = snapshot.members.filter(
    (member) => member.membershipStatus === "active",
  );
  const systemRoles = snapshot.roles.filter((role) => role.isSystem);
  const customRoles = snapshot.roles.filter((role) => !role.isSystem);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Synthetic workspace roles and access administration.">
  <title>Roles &amp; Access — ${escapeHtml(theme.appName)}</title>
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
      <span>Roles &amp; Access</span>
    </nav>

    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Workspace authorization</p>
      <h1 id="page-title">Roles &amp; Access</h1>
      <p class="lede">Manage internal application roles independently from how a person signs in. A small deployment can use locally managed members, while a future enterprise deployment can map Microsoft Entra ID / Active Directory, OIDC, or SAML identities and groups into the same role model.</p>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
    </section>

    <section class="boundary" aria-labelledby="boundary-title">
      <div><p class="eyebrow">Safety boundary</p><h2 id="boundary-title">Provider-neutral authorization</h2></div>
      <ul>
        <li>Workspace role assignment requires <code>role.manage</code> for the current workspace.</li>
        <li>Creating or changing a tenant-owned custom role additionally requires <code>tenant.manage</code>.</li>
        <li>Built-in system roles remain immutable. Custom roles can use only the bounded operational permissions shown below.</li>
        <li>Custom roles cannot grant <code>*</code>, <code>tenant.manage</code>, <code>workspace.manage</code>, or <code>role.manage</code>, preventing access-administration privilege escalation.</li>
        <li>Directory/group synchronization is intentionally deferred. A future identity-provider adapter should map external principals to these same internal role definitions rather than changing authorization rules.</li>
        <li>Changes append evidence to the existing audit stream; custom-role edits show tenant-wide assignment impact before a consequential update.</li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="assign-title">
      <div class="section-heading"><div><p class="eyebrow">New assignment</p><h2 id="assign-title">Assign workspace role</h2></div><p>${activeMembers.length} active member${activeMembers.length === 1 ? "" : "s"} · ${snapshot.roles.length} eligible role${snapshot.roles.length === 1 ? "" : "s"}</p></div>
      <form method="post" action="/demo/app/admin/access/assign" class="assign-form">
        <label>Member
          <select name="subjectId" required>
            <option value="">Select an active member</option>
            ${activeMembers.map((member) => `<option value="${escapeHtml(member.subjectId)}">${escapeHtml(member.displayName)}${member.email ? ` — ${escapeHtml(member.email)}` : ""}</option>`).join("")}
          </select>
        </label>
        <label>Workspace role
          <select name="roleDefinitionId" required>
            <option value="">Select a role</option>
            ${snapshot.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}${role.isSystem ? "" : " — custom"}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Assign role</button>
      </form>
    </section>

    <section class="panel" aria-labelledby="custom-create-title">
      <div class="section-heading"><div><p class="eyebrow">Tenant-owned authorization</p><h2 id="custom-create-title">Create custom workspace role</h2></div><p>${customRoles.length} custom role${customRoles.length === 1 ? "" : "s"}</p></div>
      <p class="muted">Custom roles are tenant-owned and can be assigned in any workspace in this tenant. Their identity is intentionally independent of local, Entra ID, OIDC, or SAML sign-in sources.</p>
      <form method="post" action="/demo/app/admin/access/roles/create" class="role-form">
        <label>Role name
          <input name="name" required minlength="2" maxlength="80" autocomplete="off" placeholder="Records Coordinator">
        </label>
        ${permissionFieldset([])}
        <button type="submit">Create custom role</button>
      </form>
    </section>

    <section class="panel" aria-labelledby="assignments-title">
      <div class="section-heading"><div><p class="eyebrow">Current access</p><h2 id="assignments-title">Workspace assignments</h2></div><p>${snapshot.bindings.length} assignment${snapshot.bindings.length === 1 ? "" : "s"}</p></div>
      ${snapshot.bindings.length === 0 ? '<p class="empty">No workspace role assignments are currently recorded.</p>' : `<div class="table-wrap"><table><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Assigned</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${snapshot.bindings.map((binding) => `<tr><td><strong>${escapeHtml(binding.subjectName)}</strong><br><code>${escapeHtml(binding.subjectId)}</code></td><td>${escapeHtml(binding.roleName)}<br><code>${escapeHtml(binding.roleKey)}</code></td><td>${escapeHtml(binding.createdAt)}</td><td><form method="post" action="/demo/app/admin/access/remove"><input type="hidden" name="bindingId" value="${escapeHtml(binding.id)}"><button class="secondary" type="submit" aria-label="Remove ${escapeHtml(binding.roleName)} from ${escapeHtml(binding.subjectName)}">Remove</button></form></td></tr>`).join("")}</tbody></table></div>`}
    </section>

    <section class="panel" aria-labelledby="custom-roles-title">
      <div class="section-heading"><div><p class="eyebrow">Tenant-owned definitions</p><h2 id="custom-roles-title">Custom workspace roles</h2></div><p>Changes apply across this tenant</p></div>
      ${customRoles.length === 0 ? '<p class="empty">No custom workspace roles exist yet.</p>' : `<div class="custom-role-list">${customRoles.map(renderCustomRoleEditor).join("")}</div>`}
    </section>

    <section class="split">
      <article class="panel" aria-labelledby="members-title">
        <p class="eyebrow">Tenant membership</p><h2 id="members-title">Members</h2>
        <ul class="cards">${snapshot.members.map((member) => `<li><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(member.membershipStatus)} · ${escapeHtml(member.provider)}</span>${member.email ? `<span>${escapeHtml(member.email)}</span>` : ""}</li>`).join("")}</ul>
      </article>
      <article class="panel" aria-labelledby="roles-title">
        <p class="eyebrow">Immutable defaults</p><h2 id="roles-title">Built-in workspace roles</h2>
        <ul class="cards">${systemRoles.map((role) => `<li><strong>${escapeHtml(role.name)}</strong><span><code>${escapeHtml(role.key)}</code> · system</span><span>${role.permissions.length === 0 ? "No permissions" : role.permissions.map(escapeHtml).join(", ")}</span></li>`).join("")}</ul>
      </article>
    </section>
  </main>
  <footer><div class="shell"><p>Synthetic access administration by ${escapeHtml(theme.companyName)} · no tracking.</p></div></footer>
</body>
</html>`;
}

function renderCustomRoleEditor(role: AccessRoleDefinition): string {
  const impact =
    role.assignmentCount === 0
      ? '<p class="impact clear">No current tenant assignments use this role.</p>'
      : `<div class="impact"><strong>${role.assignmentCount} current tenant assignment${role.assignmentCount === 1 ? "" : "s"} will be affected by changes:</strong><ul>${role.assignedMembers.map((member) => `<li>${escapeHtml(member)}</li>`).join("")}</ul></div>`;
  const acknowledgement =
    role.assignmentCount === 0
      ? ""
      : `<label class="ack"><input type="checkbox" name="acknowledgeAssignments" value="yes" required> I understand this change affects the current assignments listed above.</label>`;
  return `<article class="custom-role-card">
    <div class="role-heading"><div><p class="eyebrow">Custom role</p><h3>${escapeHtml(role.name)}</h3></div><code>${escapeHtml(role.key)}</code></div>
    ${impact}
    <form method="post" action="/demo/app/admin/access/roles/update" class="role-form">
      <input type="hidden" name="roleDefinitionId" value="${escapeHtml(role.id)}">
      <label>Role name
        <input name="name" required minlength="2" maxlength="80" value="${escapeHtml(role.name)}" autocomplete="off">
      </label>
      ${permissionFieldset(role.permissions)}
      ${acknowledgement}
      <button type="submit">Save custom role</button>
    </form>
  </article>`;
}

function permissionFieldset(selectedPermissions: readonly string[]): string {
  return `<fieldset><legend>Operational permissions</legend><p class="field-help">Administrative grants are intentionally excluded from custom roles.</p><div class="permission-grid">${customWorkspaceRolePermissions.map((permission) => `<label class="permission"><input type="checkbox" name="permission" value="${permission}"${selectedPermissions.includes(permission) ? " checked" : ""}> <span><code>${permission}</code></span></label>`).join("")}</div></fieldset>`;
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
  return `:root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-accent:${theme.accent};--surface:#f8f7f2;--raised:#fff;--muted-surface:#e8eee9;--text:#102f38;--muted:#4b6369;--border:#cad5d1;--focus:#b85e3c;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:var(--surface)}*{box-sizing:border-box}body{margin:0;min-width:320px;line-height:1.55;background:var(--surface)}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.skip-link{position:fixed;top:-5rem;left:1rem;z-index:10;padding:.7rem;background:var(--raised)}.skip-link:focus{top:1rem}header,footer{background:var(--raised);border-bottom:1px solid var(--border)}footer{border-top:1px solid var(--border);border-bottom:0;margin-top:4rem;color:var(--muted)}footer .shell{padding-block:1.5rem}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:76px}.wordmark{display:flex;flex-direction:column;text-decoration:none;line-height:1.05}.wordmark span,.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-accent)}.wordmark strong{font-size:1.14rem;color:var(--brand-primary)}.demo-label{font-size:.82rem;color:var(--muted)}main{padding-top:1.2rem}.breadcrumbs{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin-bottom:2rem}.intro{max-width:900px;margin-bottom:2rem}.intro h1{font-size:clamp(2.2rem,7vw,4.6rem);line-height:.98;letter-spacing:-.05em;color:var(--brand-primary);margin:.3rem 0 1rem}.lede{font-size:1.1rem;color:var(--muted)}.muted,.field-help{color:var(--muted)}.notice{background:var(--muted-surface);border-left:4px solid var(--brand-secondary);padding:.8rem 1rem;font-weight:700}.boundary,.panel{background:var(--raised);border:1px solid var(--border);border-radius:18px;padding:clamp(1rem,3vw,1.6rem);margin-block:1rem}.boundary h2,.panel h2{margin:.1rem 0 .5rem;color:var(--brand-primary)}.boundary ul{margin-bottom:0}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-heading p{color:var(--muted);margin:0}.assign-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:1rem;align-items:end}.role-form{display:grid;gap:1rem}label{display:grid;gap:.4rem;font-weight:750;color:var(--brand-primary)}input,select,button{min-height:46px;border-radius:10px;font:inherit}input[type=text],input[name=name],select{width:100%;border:1px solid var(--border);padding:.6rem .75rem;background:var(--surface);color:var(--text)}button{border:0;background:var(--brand-primary);color:#fff;font-weight:800;padding:.65rem 1rem;cursor:pointer}.secondary{background:transparent;color:var(--brand-primary);border:1px solid var(--border);min-height:38px}fieldset{border:1px solid var(--border);border-radius:14px;padding:1rem;margin:0}legend{font-weight:800;color:var(--brand-primary);padding-inline:.35rem}.field-help{margin:.1rem 0 .8rem}.permission-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.55rem}.permission{display:flex;align-items:center;gap:.5rem;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:.55rem .65rem;font-weight:600;min-width:0}.permission input,.ack input{min-height:auto;width:1.1rem;height:1.1rem;flex:0 0 auto}.permission code{overflow-wrap:anywhere}.custom-role-list{display:grid;gap:1rem}.custom-role-card{border:1px solid var(--border);background:var(--surface);border-radius:14px;padding:1rem}.role-heading{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.role-heading h3{margin:.15rem 0;color:var(--brand-primary)}.impact{background:var(--muted-surface);border-radius:10px;padding:.75rem 1rem;margin:1rem 0}.impact.clear{color:var(--muted)}.impact ul{margin:.45rem 0 0;padding-left:1.2rem}.ack{display:flex;grid-template-columns:auto 1fr;align-items:flex-start;gap:.6rem;background:var(--muted-surface);padding:.75rem;border-radius:10px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;padding:.8rem .7rem;border-bottom:1px solid var(--border);vertical-align:top}th{font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}td form{margin:0}.split{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.cards{list-style:none;padding:0;margin:0;display:grid;gap:.7rem}.cards li{display:grid;gap:.15rem;background:var(--surface);border-radius:12px;padding:.8rem}.cards span{color:var(--muted);font-size:.9rem}.empty{color:var(--muted)}code{overflow-wrap:anywhere}.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}@media(max-width:900px){.permission-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.header-inner{align-items:flex-start;flex-direction:column;padding-block:1rem}.assign-form,.split,.permission-grid{grid-template-columns:1fr}.section-heading,.role-heading{align-items:flex-start;flex-direction:column}}@media(prefers-color-scheme:dark){:root{--surface:#0c171b;--raised:#122329;--muted-surface:#19343a;--text:#f1f5f2;--muted:#b3c4c5;--border:#315057;--focus:#f0a176}input[type=text],input[name=name],select{background:#0f2025;color:var(--text)}.wordmark strong,.intro h1,.boundary h2,.panel h2,label,legend,.role-heading h3,.secondary{color:#f1f5f2}button:not(.secondary){background:var(--brand-secondary)}}`;
}
