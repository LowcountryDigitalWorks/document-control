import { AuthorizationDeniedError } from "../../application/authorization";
import { analyzeWorkflowGraph } from "../../application/workflow-authoring";
import {
  parseExistingWorkflowId,
  parseOptionalWorkflowSourceVersion,
  parseWorkflowAuthoringMode,
  parseWorkflowDefinitionInput,
  parseWorkflowSourceQuery,
  WorkflowDefinitionInputValidationError,
} from "../../application/workflow-definition-input";
import {
  parseWorkflowLifecycleInput,
  WorkflowLifecycleInputValidationError,
} from "../../application/workflow-lifecycle-input";
import {
  parseWorkspaceWorkflowSelectionInput,
  WorkspaceWorkflowSelectionInputValidationError,
} from "../../application/workspace-workflow-selection-input";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import { ensureGuidedTenantAdmin } from "../../demo/tenant-admin-context";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderWorkflowDefinitionAdmin } from "../../ui/render-workflow-definition-admin";
import { renderWorkspaceWorkflowSelection } from "../../ui/render-workspace-workflow-selection";
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
  readWorkflowFormValues,
  readWorkflowLifecycleFormValues,
  readWorkflowSelectionFormValues,
} from "../form-values";
import type { DocumentControlApp } from "../types";

export function registerWorkflowAdministrationRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/admin/workflows", async (context) => {
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
      const catalog = await dependencies.workflowDefinitionAdmin.getCatalog({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const url = new URL(context.req.url);
      const sourceQuery = parseWorkflowSourceQuery(url.searchParams);
      const sourceDefinition = sourceQuery
        ? catalog.definitions.find(
            (definition) =>
              definition.id === sourceQuery.workflowDefinitionId &&
              definition.version === sourceQuery.workflowDefinitionVersion,
          )
        : undefined;
      if (sourceQuery && !sourceDefinition) {
        return context.text(
          "The requested workflow source version does not exist in this tenant.",
          400,
        );
      }
      const authoring = sourceDefinition
        ? {
            mode: "version" as const,
            workflowDefinitionId: sourceDefinition.id,
            sourceDefinition,
            draft: {
              name: sourceDefinition.name,
              states: sourceDefinition.states,
              transitions: sourceDefinition.transitions,
            },
            analysis: analyzeWorkflowGraph(
              sourceDefinition.states,
              sourceDefinition.transitions,
            ),
          }
        : undefined;
      const noticeValue = url.searchParams.get("notice");
      const notice =
        noticeValue === "created"
          ? "Workflow definition created."
          : noticeValue === "versioned"
            ? "Workflow version created."
            : noticeValue === "lifecycle"
              ? "Workflow lifecycle transition recorded."
              : undefined;
      context.header("Cache-Control", "no-store");
      return context.html(
        renderWorkflowDefinitionAdmin(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          catalog,
          notice,
          authoring,
        ),
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/workflows/analyze", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Workflow Definitions.",
        },
        409,
      );
    }

    try {
      const values = await readWorkflowFormValues(context.req.raw, [
        "mode",
        "workflowDefinitionId",
        "sourceVersion",
        "name",
        "states",
        "transitions",
      ]);
      const mode = parseWorkflowAuthoringMode(values);
      const input = parseWorkflowDefinitionInput(values);
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(dependencies.database, sessionId);
      const catalog = await dependencies.workflowDefinitionAdmin.getCatalog({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });

      let workflowDefinitionId: string | undefined;
      let sourceDefinition;
      if (mode === "version") {
        workflowDefinitionId = parseExistingWorkflowId(values);
        if (
          !catalog.definitions.some(
            (definition) => definition.id === workflowDefinitionId,
          )
        ) {
          return context.text(
            "The requested workflow definition does not exist in this tenant.",
            400,
          );
        }
        const sourceVersion = parseOptionalWorkflowSourceVersion(values);
        if (sourceVersion !== undefined) {
          sourceDefinition = catalog.definitions.find(
            (definition) =>
              definition.id === workflowDefinitionId &&
              definition.version === sourceVersion,
          );
          if (!sourceDefinition) {
            return context.text(
              "The requested workflow source version does not exist in this tenant.",
              400,
            );
          }
        }
      }

      context.header("Cache-Control", "no-store");
      return context.html(
        renderWorkflowDefinitionAdmin(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          catalog,
          undefined,
          {
            mode,
            workflowDefinitionId,
            sourceDefinition,
            draft: input,
            analysis: analyzeWorkflowGraph(input.states, input.transitions),
          },
        ),
      );
    } catch (error) {
      if (error instanceof WorkflowDefinitionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      throw error;
    }
  });

  app.post("/demo/app/admin/workflows/create", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Workflow Definitions.",
        },
        409,
      );
    }

    try {
      const input = parseWorkflowDefinitionInput(
        await readWorkflowFormValues(context.req.raw, [
          "name",
          "states",
          "transitions",
        ]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(dependencies.database, sessionId);
      await dependencies.workflowDefinitionAdmin.createDefinition(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          workflowDefinitionId: `workflow-${crypto.randomUUID()}`,
          auditEventId: `workflow-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
          input,
        },
      );
      return context.redirect("/demo/app/admin/workflows?notice=created", 303);
    } catch (error) {
      if (error instanceof WorkflowDefinitionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Workflow definition creation failed.";
      return context.text(message, 409);
    }
  });

  app.post("/demo/app/admin/workflows/version", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Workflow Definitions.",
        },
        409,
      );
    }

    try {
      const values = await readWorkflowFormValues(context.req.raw, [
        "workflowDefinitionId",
        "name",
        "states",
        "transitions",
      ]);
      const workflowDefinitionId = parseExistingWorkflowId(values);
      const input = parseWorkflowDefinitionInput(values);
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(dependencies.database, sessionId);
      await dependencies.workflowDefinitionAdmin.createVersion(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          workflowDefinitionId,
          auditEventId: `workflow-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
          input,
        },
      );
      return context.redirect("/demo/app/admin/workflows?notice=versioned", 303);
    } catch (error) {
      if (error instanceof WorkflowDefinitionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Workflow version creation failed.";
      return context.text(message, 409);
    }
  });

  app.post("/demo/app/admin/workflows/lifecycle", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Workflow Definitions.",
        },
        409,
      );
    }

    try {
      const input = parseWorkflowLifecycleInput(
        await readWorkflowLifecycleFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(dependencies.database, sessionId);
      await dependencies.workflowDefinitionAdmin.transitionLifecycle(
        {
          subjectId: admin.subjectId,
          tenantId: demo.tenantId,
          workspaceId: demo.workspaceId,
        },
        {
          workflowDefinitionId: input.workflowDefinitionId,
          workflowDefinitionVersion: input.workflowDefinitionVersion,
          targetState: input.targetState,
          auditEventId: `workflow-lifecycle-audit-${crypto.randomUUID()}`,
          occurredAt: new Date().toISOString(),
        },
      );
      return context.redirect("/demo/app/admin/workflows?notice=lifecycle", 303);
    } catch (error) {
      if (error instanceof WorkflowLifecycleInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error
          ? error.message
          : "Workflow lifecycle transition failed.",
        409,
      );
    }
  });

  app.get("/demo/app/admin/workflow-selection", async (context) => {
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
      const catalog = await dependencies.workspaceWorkflowSelection.getCatalog({
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      });
      const noticeValue = new URL(context.req.url).searchParams.get("notice");
      const notice =
        noticeValue === "enabled"
          ? "Workflow version made available to this workspace."
          : noticeValue === "disabled"
            ? "Workflow version removed from this workspace."
            : noticeValue === "default"
              ? "Workspace default workflow changed."
              : noticeValue === "unchanged"
                ? "No workflow selection change was needed."
                : undefined;
      context.header("Cache-Control", "no-store");
      return context.html(
        renderWorkspaceWorkflowSelection(
          await createPersistedTenantTheme(
            dependencies.database,
            context.env,
            demo.tenantId,
          ),
          catalog,
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

  app.post("/demo/app/admin/workflow-selection/update", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error:
            "Synthetic administration session missing. Reload Workflow Selection.",
        },
        409,
      );
    }

    try {
      const input = parseWorkspaceWorkflowSelectionInput(
        await readWorkflowSelectionFormValues(context.req.raw),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const admin = await ensureGuidedTenantAdmin(dependencies.database, sessionId);
      const authContext = {
        subjectId: admin.subjectId,
        tenantId: demo.tenantId,
        workspaceId: demo.workspaceId,
      };
      const baseCommand = {
        workflowDefinitionId: input.workflowDefinitionId,
        workflowDefinitionVersion: input.workflowDefinitionVersion,
        auditEventId: `workflow-selection-audit-${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
      };

      let result: { changed: boolean };
      if (input.action === "default") {
        result = await dependencies.workspaceWorkflowSelection.setDefault(
          authContext,
          baseCommand,
        );
      } else {
        result = await dependencies.workspaceWorkflowSelection.setApplicability(
          authContext,
          {
            ...baseCommand,
            applicable: input.action === "enable",
          },
        );
      }
      const notice = result.changed
        ? input.action === "enable"
          ? "enabled"
          : input.action === "disable"
            ? "disabled"
            : "default"
        : "unchanged";
      return context.redirect(
        `/demo/app/admin/workflow-selection?notice=${notice}`,
        303,
      );
    } catch (error) {
      if (error instanceof WorkspaceWorkflowSelectionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Workflow selection update failed.";
      return context.text(message, 409);
    }
  });
}
