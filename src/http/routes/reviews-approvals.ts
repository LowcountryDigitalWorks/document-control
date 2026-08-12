import { AuthorizationDeniedError } from "../../application/authorization";
import {
  parseApprovalQueueActionInput,
  parseReviewQueueActionInput,
  WorkQueueActionInputValidationError,
} from "../../application/work-queue-action-input";
import { createPersistedTenantTheme } from "../../demo/persisted-theme";
import {
  createGuidedDemoContext,
  ensureGuidedDemoSeed,
} from "../../demo/workflow-demo";
import { renderReviewApprovalQueue } from "../../ui/render-review-approval-queue";
import { renderNotFound } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import {
  guidedDemoEnabled,
  hasSameOrigin,
  readGuidedDemoSession,
  resolveGuidedDemoSession,
} from "../demo-session";
import type { RequestDependenciesFactory } from "../dependencies";
import { readWorkQueueActionFormValues } from "../form-values";
import type { DocumentControlApp } from "../types";

export function registerReviewApprovalRoutes(
  app: DocumentControlApp,
  createDependencies: RequestDependenciesFactory,
): void {
  app.get("/demo/app/reviews", async (context) => {
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
    const items = await dependencies.reviewApprovalQueueRead.listReviewQueue({
      subjectId: demo.reviewerSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const noticeValue = new URL(context.req.url).searchParams.get("notice");
    const notice =
      noticeValue === "accepted"
        ? "Review accepted. The exact current version moved to approval."
        : noticeValue === "changes-requested"
          ? "Changes requested. The workflow returned to Draft and the review item cleared."
          : undefined;
    return context.html(
      renderReviewApprovalQueue(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        demo.workspaceName,
        "review",
        items,
        notice,
      ),
    );
  });

  app.post("/demo/app/reviews/:workflowInstanceId/decision", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        { error: "Synthetic review session missing. Reload the Reviewer queue." },
        409,
      );
    }

    try {
      const input = parseReviewQueueActionInput(
        await readWorkQueueActionFormValues(context.req.raw, [
          "decision",
          "comment",
        ]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const occurredAt = new Date().toISOString();
      await dependencies.documentWorkflow.recordReview({
        tenantId: demo.tenantId,
        workflowInstanceId: context.req.param("workflowInstanceId"),
        reviewId: `queue-review-${crypto.randomUUID()}`,
        actorSubjectId: demo.reviewerSubjectId,
        decision: input.decision,
        comment: input.comment,
        occurredAt,
        auditEventId: `queue-review-audit-${crypto.randomUUID()}`,
      });
      return context.redirect(
        `/demo/app/reviews?notice=${input.decision === "accepted" ? "accepted" : "changes-requested"}`,
        303,
      );
    } catch (error) {
      if (error instanceof WorkQueueActionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error ? error.message : "Review action failed.",
        409,
      );
    }
  });

  app.get("/demo/app/approvals", async (context) => {
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
    const items = await dependencies.reviewApprovalQueueRead.listApprovalQueue({
      subjectId: demo.approverSubjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });
    const notice =
      new URL(context.req.url).searchParams.get("notice") === "approved"
        ? "Exact current version approved. Approval evidence is preserved in the document record."
        : undefined;
    return context.html(
      renderReviewApprovalQueue(
        await createPersistedTenantTheme(
          dependencies.database,
          context.env,
          demo.tenantId,
        ),
        demo.workspaceName,
        "approval",
        items,
        notice,
      ),
    );
  });

  app.post("/demo/app/approvals/:workflowInstanceId/approve", async (context) => {
    if (!guidedDemoEnabled(context.env)) return context.notFound();
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.json({ error: "Same-origin demo request required." }, 403);
    }
    const sessionId = readGuidedDemoSession(context.req.header("Cookie"));
    if (!sessionId) {
      return context.json(
        {
          error: "Synthetic approval session missing. Reload the Approver queue.",
        },
        409,
      );
    }

    try {
      parseApprovalQueueActionInput(
        await readWorkQueueActionFormValues(context.req.raw, ["confirmApproval"]),
      );
      const dependencies = createDependencies(context.env);
      const demo = createGuidedDemoContext(sessionId);
      await ensureGuidedDemoSeed(dependencies.database, sessionId);
      const occurredAt = new Date().toISOString();
      await dependencies.documentWorkflow.approveCurrentVersion({
        tenantId: demo.tenantId,
        workflowInstanceId: context.req.param("workflowInstanceId"),
        approvalId: `queue-approval-${crypto.randomUUID()}`,
        actorSubjectId: demo.approverSubjectId,
        occurredAt,
        auditEventId: `queue-approval-audit-${crypto.randomUUID()}`,
      });
      return context.redirect("/demo/app/approvals?notice=approved", 303);
    } catch (error) {
      if (error instanceof WorkQueueActionInputValidationError) {
        return context.text(error.message, 400);
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.html(renderNotFound(createTheme(context.env)), 404);
      }
      return context.text(
        error instanceof Error ? error.message : "Approval action failed.",
        409,
      );
    }
  });
}
