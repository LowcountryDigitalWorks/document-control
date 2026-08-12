import { AuditLogReadService } from "../application/audit-log-read-service";
import { AuthorizedAuditLogReadService } from "../application/authorized-audit-log-read-service";
import { AuthorizedDocumentDetailReadService } from "../application/authorized-document-detail-read-service";
import { AuthorizedDocumentWorkflowService } from "../application/authorized-document-workflow-service";
import { AuthorizedMemberAdminService } from "../application/authorized-member-admin-service";
import { AuthorizedPortableExportService } from "../application/authorized-portable-export-service";
import { AuthorizedPresentationSettingsService } from "../application/authorized-presentation-settings-service";
import { AuthorizedReviewApprovalQueueReadService } from "../application/authorized-review-approval-queue-read-service";
import { AuthorizedRolesAccessAdminService } from "../application/authorized-roles-access-admin-service";
import { AuthorizedTemplateDetailReadService } from "../application/authorized-template-detail-read-service";
import { AuthorizedTemplateLifecycleAdminService } from "../application/authorized-template-lifecycle-admin-service";
import { AuthorizedWorkflowDefinitionAdminService } from "../application/authorized-workflow-definition-admin-service";
import { AuthorizedWorkspaceReadService } from "../application/authorized-workspace-read-service";
import { AuthorizedWorkspaceWorkflowSelectionService } from "../application/authorized-workspace-workflow-selection-service";
import { DocumentDetailReadService } from "../application/document-detail-read-service";
import { DocumentWorkflowService } from "../application/document-workflow-service";
import { MemberAdminService } from "../application/member-admin-service";
import type { DatabaseProvider } from "../application/ports";
import { PortableExportReadService } from "../application/portable-export-read-service";
import { PresentationSettingsService } from "../application/presentation-settings-service";
import { ReviewApprovalQueueReadService } from "../application/review-approval-queue-read-service";
import { RolesAccessAdminService } from "../application/roles-access-admin-service";
import { TemplateDetailReadService } from "../application/template-detail-read-service";
import { TemplateLifecycleAdminService } from "../application/template-lifecycle-admin-service";
import { WorkflowDefinitionAdminService } from "../application/workflow-definition-admin-service";
import { WorkspaceReadService } from "../application/workspace-read-service";
import { WorkspaceWorkflowSelectionService } from "../application/workspace-workflow-selection-service";
import { DatabaseAuthorizationPolicy } from "../infrastructure/database-authorization-policy";
import { D1DatabaseProvider } from "../infrastructure/d1-database-provider";
import type { Bindings } from "./types";

export interface RequestDependencies {
  database: DatabaseProvider;
  workspaceRead: AuthorizedWorkspaceReadService;
  templateDetailRead: AuthorizedTemplateDetailReadService;
  documentDetailRead: AuthorizedDocumentDetailReadService;
  documentWorkflow: AuthorizedDocumentWorkflowService;
  reviewApprovalQueueRead: AuthorizedReviewApprovalQueueReadService;
  auditLogRead: AuthorizedAuditLogReadService;
  presentationSettings: AuthorizedPresentationSettingsService;
  memberAdmin: AuthorizedMemberAdminService;
  rolesAccessAdmin: AuthorizedRolesAccessAdminService;
  workflowDefinitionAdmin: AuthorizedWorkflowDefinitionAdminService;
  workspaceWorkflowSelection: AuthorizedWorkspaceWorkflowSelectionService;
  templateLifecycleAdmin: AuthorizedTemplateLifecycleAdminService;
  portableExport: AuthorizedPortableExportService;
}

export type RequestDependenciesFactory = (
  bindings: Bindings,
) => RequestDependencies;

export function createRequestDependencies(
  bindings: Bindings,
): RequestDependencies {
  const database = new D1DatabaseProvider(bindings.DOCUMENT_CONTROL_DB);
  const authorization = new DatabaseAuthorizationPolicy(database);

  return {
    database,
    workspaceRead: new AuthorizedWorkspaceReadService(
      new WorkspaceReadService(database),
      authorization,
    ),
    templateDetailRead: new AuthorizedTemplateDetailReadService(
      new TemplateDetailReadService(database),
      authorization,
    ),
    documentDetailRead: new AuthorizedDocumentDetailReadService(
      new DocumentDetailReadService(database),
      authorization,
    ),
    documentWorkflow: new AuthorizedDocumentWorkflowService(
      new DocumentWorkflowService(database),
      authorization,
    ),
    reviewApprovalQueueRead: new AuthorizedReviewApprovalQueueReadService(
      new ReviewApprovalQueueReadService(database),
      authorization,
    ),
    auditLogRead: new AuthorizedAuditLogReadService(
      new AuditLogReadService(database),
      authorization,
    ),
    presentationSettings: new AuthorizedPresentationSettingsService(
      new PresentationSettingsService(database),
      authorization,
    ),
    memberAdmin: new AuthorizedMemberAdminService(
      new MemberAdminService(database),
      authorization,
    ),
    rolesAccessAdmin: new AuthorizedRolesAccessAdminService(
      new RolesAccessAdminService(database),
      authorization,
    ),
    workflowDefinitionAdmin: new AuthorizedWorkflowDefinitionAdminService(
      new WorkflowDefinitionAdminService(database),
      authorization,
    ),
    workspaceWorkflowSelection: new AuthorizedWorkspaceWorkflowSelectionService(
      new WorkspaceWorkflowSelectionService(database),
      authorization,
    ),
    templateLifecycleAdmin: new AuthorizedTemplateLifecycleAdminService(
      new TemplateLifecycleAdminService(database),
      authorization,
    ),
    portableExport: new AuthorizedPortableExportService(
      new PortableExportReadService(database),
      authorization,
    ),
  };
}
