import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { renderNotFound } from "../ui/render";
import { createTheme } from "../ui/theme";
import type { RequestDependenciesFactory } from "./dependencies";
import { registerAdministrationRoutes } from "./routes/administration";
import { registerAuditRoutes } from "./routes/audit";
import { registerBackupRoutes } from "./routes/backup";
import { registerDemoWorkflowRoutes } from "./routes/demo-workflow";
import { registerReviewApprovalRoutes } from "./routes/reviews-approvals";
import { registerSystemRoutes } from "./routes/system";
import { registerTemplateAdministrationRoutes } from "./routes/template-administration";
import { registerWorkflowAdministrationRoutes } from "./routes/workflow-administration";
import { registerWorkspaceRoutes } from "./routes/workspace";
import type { AppEnvironment } from "./types";

export function createApp(createDependencies: RequestDependenciesFactory) {
  const app = new Hono<AppEnvironment>();

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        styleSrc: ["'unsafe-inline'"],
      },
      crossOriginOpenerPolicy: "same-origin",
      referrerPolicy: "strict-origin-when-cross-origin",
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
    }),
  );

  registerSystemRoutes(app);
  registerDemoWorkflowRoutes(app, createDependencies);
  registerWorkspaceRoutes(app, createDependencies);
  registerReviewApprovalRoutes(app, createDependencies);
  registerAuditRoutes(app, createDependencies);
  registerAdministrationRoutes(app, createDependencies);
  registerWorkflowAdministrationRoutes(app, createDependencies);
  registerTemplateAdministrationRoutes(app, createDependencies);
  registerBackupRoutes(app, createDependencies);

  app.notFound((context) =>
    context.html(renderNotFound(createTheme(context.env)), 404),
  );

  return app;
}
