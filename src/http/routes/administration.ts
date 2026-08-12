import { AuthorizationDeniedError } from "../../application/authorization";
import {
  MemberAdminInputValidationError,
  parseDirectMemberInput,
  parseMembershipTransitionInput,
} from "../../application/member-admin-input";
import {
  parsePresentationSettingsInput,
  PresentationSettingsValidationError,
} from "../../application/presentation-settings-input";
import {
  parseCustomRoleCreateInput,
  parseCustomRoleRetirementInput,
  parseCustomRoleUpdateInput,
  parseRoleAssignmentInput,
  parseRoleRemovalInput,
  RolesAccessInputValidationError,
} from "../../application/roles-access-input";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import { ensureGuidedTenantAdmin } from "../../demo/tenant-admin-context";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderAdminSettings } from "../../ui/render-admin-settings";
import { renderMemberAdmin } from "../../ui/render-member-admin";
import { renderRolesAccessAdmin } from "../../ui/render-roles-access-admin";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  hasSameOrigin,
  readGuidedDemoSession,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import {
  readMemberFormValues,
  readRoleDefinitionFormValues,
  readRolesAccessFormValues,
} from "../form-values";
import type { DocumentControlApp } from "../types";

export function registerAdministrationRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/admin/settings", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    const session = resolveGuidedDemoSession(
      context.req.header("Cookie"),
      context.req.url,
    );
    if (session.setCookie) {
      context.header("Set-Cookie", session.setCookie);
    }
    const dependencies = createDependencies(context.env);
    const demo = createGuidedDemoContext(session.sessionId);
    await ensureGuidedDemoSeed(dependencies.database, session.sessionId);
    const admin = await ensureGuidedTenantAdmin(
      dependencies.database,
      session.sessionId,
    );

    try {
      const settings = await dependencies.presentationSettings.getSettings({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const theme = await createPersistedTenantTheme(
        dependencies.database,
        context.env,
        demo.tenantId,
      );
      context.header("Cache-Control", "no-store");
      return context.html(
        renderAdminSettings(
          theme,
          settings,
          new URL(context.req.url).searchParams.get("saved") === "1",
        ),
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/settings", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.notFound();
    }
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }

    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Administration.",
        },
        409,
      );
    }

    let formData: FormData;
    try {
      formData = await context.req.raw.formData();
    } catch {
      return context.text("A valid form body is required.", 400);
    }
    const values = new URLSearchParams();
    for (const key of [
      "workspaceName",
      "appName",
      "companyName",
      "primary",
      "secondary",
      "accent",
      "workspaceTerm",
      "documentTerm",
      "approvalTerm",
    ]) {
      const value = formData.get(key);
      if (typeof value === "string") values.set(key, value);
    }

    const dependencies = createDependencies(context.env);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(dependencies.database, sessionId);
    const admin = await ensureGuidedTenantAdmin(
      dependencies.database,
      sessionId,
    );

    try {
      const input = parsePresentationSettingsInput(values);
      await dependencies.presentationSettings.updateSettings(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          input,
          occurredAt: new Date().toISOString(),
          auditEventId: `settings-${crypto.randomUUID()}`,
        },
      );
    } catch (error) {
      if (error instanceof PresentationSettingsValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }

    return context.redirect("/demo/app/admin/settings?saved=1", 303);
  });

  app.get("/demo/app/admin/members", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }
    const session = resolveGuidedDemoSession(
      context.req.header("Cookie"),
      context.req.url,
    );
    if (session.setCookie) context.header("Set-Cookie", session.setCookie);
    const dependencies = createDependencies(context.env);
    const demo = createGuidedDemoContext(session.sessionId);
    await ensureGuidedDemoSeed(dependencies.database, session.sessionId);
    const admin = await ensureGuidedTenantAdmin(
      dependencies.database,
      session.sessionId,
    );

    try {
      const directory = await dependencies.memberAdmin.getDirectory({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const noticeValue = new URL(context.req.url).searchParams.get("notice");
      const notice =
        noticeValue === "created"
          ? "Tenant member added."
          : noticeValue === "activated"
            ? "Membership activated."
            : noticeValue === "suspended"
              ? "Membership suspended."
              : undefined;
      context.header("Cache-Control", "no-store");
      return context.html(
        renderMemberAdmin(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          directory,
          admin.subjectId,
          notice,
        ),
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/members/create", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error: "Synthetic administration session missing. Reload Members.",
        },
        409,
      );
    }

    try {
      const input = parseDirectMemberInput(
        await readMemberFormValues(context.req.raw, [
          "displayName",
          "email",
          "initialStatus",
        ]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const memberUuid = crypto.randomUUID();
      await dependencies.memberAdmin.createDirectMember(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          membershipId: `membership-local-${memberUuid}`,
          subjectId: `subject-local-${memberUuid}`,
          providerSubject: `local-${memberUuid}`,
          displayName: input.displayName,
          email: input.email,
          initialStatus: input.initialStatus,
          auditEventId: `membership-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect("/demo/app/admin/members?notice=created", 303);
    } catch (error) {
      if (error instanceof MemberAdminInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error
          ? error.message
          : "Tenant member creation failed.",
        409,
      );
    }
  });

  app.post("/demo/app/admin/members/status", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error: "Synthetic administration session missing. Reload Members.",
        },
        409,
      );
    }

    try {
      const input = parseMembershipTransitionInput(
        await readMemberFormValues(context.req.raw, [
          "membershipId",
          "targetStatus",
        ]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      await dependencies.memberAdmin.transitionMembership(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          membershipId: input.membershipId,
          targetStatus: input.targetStatus,
          auditEventId: `membership-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        `/demo/app/admin/members?notice=${input.targetStatus === "active" ? "activated" : "suspended"}`,
        303,
      );
    } catch (error) {
      if (error instanceof MemberAdminInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error
          ? error.message
          : "Membership status change failed.",
        409,
      );
    }
  });

  app.get("/demo/app/admin/access", async (context) => {
    if (!guidedDemoEnabled(context.env)) {
      return context.html(renderNotFound(createTheme(context.env)), 404);
    }

    const session = resolveGuidedDemoSession(
      context.req.header("Cookie"),
      context.req.url,
    );
    if (session.setCookie) {
      context.header("Set-Cookie", session.setCookie);
    }
    const dependencies = createDependencies(context.env);
    const demo = createGuidedDemoContext(session.sessionId);
    await ensureGuidedDemoSeed(dependencies.database, session.sessionId);
    const admin = await ensureGuidedTenantAdmin(
      dependencies.database,
      session.sessionId,
    );

    try {
      const snapshot = await dependencies.rolesAccessAdmin.getWorkspaceAccess({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const noticeValue = new URL(context.req.url).searchParams.get("notice");
      const notice =
        noticeValue === "assigned"
          ? "Workspace role assigned."
          : noticeValue === "removed"
            ? "Workspace role removed."
            : noticeValue === "role-created"
              ? "Custom workspace role created."
              : noticeValue === "role-updated"
                ? "Custom workspace role updated."
                : noticeValue === "role-retired"
                  ? "Custom workspace role retired."
                  : noticeValue === "unchanged"
                    ? "No access change was needed."
                    : undefined;
      context.header("Cache-Control", "no-store");
      return context.html(
        renderRolesAccessAdmin(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          snapshot,
          notice,
        ),
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/access/assign", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Roles & Access.",
        },
        409,
      );
    }

    try {
      const input = parseRoleAssignmentInput(
        await readRolesAccessFormValues(context.req.raw, [
          "subjectId",
          "roleDefinitionId",
        ]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const result = await dependencies.rolesAccessAdmin.assignWorkspaceRole(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          subjectId: input.subjectId,
          roleDefinitionId: input.roleDefinitionId,
          bindingId: `access-${crypto.randomUUID()}`,
          auditEventId: `access-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        `/demo/app/admin/access?notice=${result.changed ? "assigned" : "unchanged"}`,
        303,
      );
    } catch (error) {
      if (error instanceof RolesAccessInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error ? error.message : "Role assignment failed.";
      return context.text(message, 409);
    }
  });

  app.post("/demo/app/admin/access/remove", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Roles & Access.",
        },
        409,
      );
    }

    try {
      const input = parseRoleRemovalInput(
        await readRolesAccessFormValues(context.req.raw, ["bindingId"]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const result = await dependencies.rolesAccessAdmin.removeWorkspaceRole(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          bindingId: input.bindingId,
          auditEventId: `access-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        `/demo/app/admin/access?notice=${result.changed ? "removed" : "unchanged"}`,
        303,
      );
    } catch (error) {
      if (error instanceof RolesAccessInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error ? error.message : "Role removal failed.";
      return context.text(message, 409);
    }
  });

  app.post("/demo/app/admin/access/roles/create", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Roles & Access.",
        },
        409,
      );
    }

    try {
      const input = parseCustomRoleCreateInput(
        await readRoleDefinitionFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const roleUuid = crypto.randomUUID();
      await dependencies.rolesAccessAdmin.createCustomWorkspaceRole(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          roleDefinitionId: `role-custom-${roleUuid}`,
          roleKey: `custom_${roleUuid.replaceAll("-", "")}`,
          name: input.name,
          permissions: input.permissions,
          auditEventId: `role-definition-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect(
        "/demo/app/admin/access?notice=role-created",
        303,
      );
    } catch (error) {
      if (error instanceof RolesAccessInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error ? error.message : "Custom role creation failed.",
        409,
      );
    }
  });

  app.post("/demo/app/admin/access/roles/update", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Roles & Access.",
        },
        409,
      );
    }

    try {
      const input = parseCustomRoleUpdateInput(
        await readRoleDefinitionFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const result =
        await dependencies.rolesAccessAdmin.updateCustomWorkspaceRole(
          {
            subjectId: admin.subjectId,
            tenantId: demo.tenantId,
            workspaceId: demo.workspaceId,
          },
          {
            roleDefinitionId: input.roleDefinitionId,
            name: input.name,
            permissions: input.permissions,
            acknowledgeAssignments: input.acknowledgeAssignments,
            auditEventId: `role-definition-audit-${crypto.randomUUID()}`,
            occurredAt: new Date().toISOString(),
          },
        );
      return context.redirect(
        `/demo/app/admin/access?notice=${result.changed ? "role-updated" : "unchanged"}`,
        303,
      );
    } catch (error) {
      if (error instanceof RolesAccessInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error ? error.message : "Custom role update failed.",
        409,
      );
    }
  });

  app.post("/demo/app/admin/access/roles/retire", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Roles & Access.",
        },
        409,
      );
    }

    try {
      const input = parseCustomRoleRetirementInput(
        await readRolesAccessFormValues(context.req.raw, ["roleDefinitionId"]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(
        dependencies.database,
        sessionId,
      );
      const result =
        await dependencies.rolesAccessAdmin.retireCustomWorkspaceRole(
          {
            subjectId: admin.subjectId,
            tenantId: demo.tenantId,
            workspaceId: demo.workspaceId,
          },
          {
            roleDefinitionId: input.roleDefinitionId,
            auditEventId: `role-definition-audit-${crypto.randomUUID()}`,
            occurredAt: new Date().toISOString(),
          },
        );
      return context.redirect(
        `/demo/app/admin/access?notice=${result.changed ? "role-retired" : "unchanged"}`,
        303,
      );
    } catch (error) {
      if (error instanceof RolesAccessInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error
          ? error.message
          : "Custom role retirement failed.",
        409,
      );
    }
  });
}
