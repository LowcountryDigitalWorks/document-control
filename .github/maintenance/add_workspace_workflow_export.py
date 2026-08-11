from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing {label} marker")
    return text.replace(old, new, 1)


export_path = Path("src/application/export.ts")
text = export_path.read_text()
text = replace_once(
    text,
    '''export interface PortableExportV1 {
''',
    '''export interface WorkspaceWorkflowAssignmentExport {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  isDefault: boolean;
  createdBySubjectId: string;
  createdAt: string;
  updatedBySubjectId: string;
  updatedAt: string;
}

export interface PortableExportV1 {
''',
    "workspace workflow export interface",
)
text = replace_once(
    text,
    '''  workflowDefinitions: WorkflowDefinition[];
  workflowInstances: WorkflowInstance[];
''',
    '''  workflowDefinitions: WorkflowDefinition[];
  workspaceWorkflowAssignments?: WorkspaceWorkflowAssignmentExport[];
  workflowInstances: WorkflowInstance[];
''',
    "portable export assignment field",
)
validation_marker = '''  for (const instance of data.workflowInstances) {
'''
validation = '''  for (const assignment of data.workspaceWorkflowAssignments ?? []) {
    assertTenant(
      assignment.tenantId,
      tenantId,
      `workspace workflow assignment ${assignment.workspaceId}`,
    );
    const workspace = assertReferenced(
      workspaces,
      assignment.workspaceId,
      "workspace workflow assignment workspace",
    ) as Workspace;
    assertTenant(
      workspace.tenantId,
      tenantId,
      `workspace workflow assignment ${assignment.workspaceId}`,
    );
    if (
      !workflowDefinitions.has(
        `${assignment.workflowDefinitionId}:${assignment.workflowDefinitionVersion}`,
      )
    ) {
      throw new Error(
        `Workspace workflow assignment ${assignment.workspaceId} references a missing workflow definition version.`,
      );
    }
    assertReferenced(
      subjects,
      assignment.createdBySubjectId,
      "workspace workflow assignment creator",
    );
    assertReferenced(
      subjects,
      assignment.updatedBySubjectId,
      "workspace workflow assignment updater",
    );
  }

  const workspaceDefaultKeys = new Set<string>();
  for (const assignment of data.workspaceWorkflowAssignments ?? []) {
    if (!assignment.isDefault) continue;
    if (workspaceDefaultKeys.has(assignment.workspaceId)) {
      throw new Error(
        `Workspace ${assignment.workspaceId} has more than one default workflow in the export.`,
      );
    }
    workspaceDefaultKeys.add(assignment.workspaceId);
  }

'''
text = replace_once(text, validation_marker, validation + validation_marker, "assignment validation")
export_path.write_text(text)

service_path = Path("src/application/portable-export-read-service.ts")
service = service_path.read_text()
service = replace_once(
    service,
    '''  type PortableExportV1,
} from "./export";
''',
    '''  type PortableExportV1,
  type WorkspaceWorkflowAssignmentExport,
} from "./export";
''',
    "assignment export type import",
)
service = replace_once(
    service,
    '''interface WorkflowDefinitionRow {
''',
    '''interface WorkspaceWorkflowAssignmentRow {
  tenantId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  isDefault: number;
  createdBySubjectId: string;
  createdAt: string;
  updatedBySubjectId: string;
  updatedAt: string;
}
interface WorkflowDefinitionRow {
''',
    "assignment row interface",
)
service = replace_once(
    service,
    '''      workflowDefinitions,
      workflowInstances,
''',
    '''      workflowDefinitions,
      workspaceWorkflowAssignments,
      workflowInstances,
''',
    "destructured assignment result",
)
service = replace_once(
    service,
    '''      this.readWorkflowDefinitions(tenantId),
      this.readWorkflowInstances(tenantId),
''',
    '''      this.readWorkflowDefinitions(tenantId),
      this.readWorkspaceWorkflowAssignments(tenantId),
      this.readWorkflowInstances(tenantId),
''',
    "assignment read promise",
)
service = replace_once(
    service,
    '''      workflowDefinitions,
      workflowInstances,
      reviews,
''',
    '''      workflowDefinitions,
      workspaceWorkflowAssignments,
      workflowInstances,
      reviews,
''',
    "assignment export object",
)
method_marker = '''  private async readWorkflowInstances(
'''
method = '''  private async readWorkspaceWorkflowAssignments(
    tenantId: string,
  ): Promise<WorkspaceWorkflowAssignmentExport[]> {
    const rows = await this.database.query<WorkspaceWorkflowAssignmentRow>(
      `SELECT tenant_id AS tenantId,
              workspace_id AS workspaceId,
              workflow_definition_id AS workflowDefinitionId,
              workflow_definition_version AS workflowDefinitionVersion,
              is_default AS isDefault,
              created_by_subject_id AS createdBySubjectId,
              created_at AS createdAt,
              updated_by_subject_id AS updatedBySubjectId,
              updated_at AS updatedAt
       FROM workspace_workflow_assignments
       WHERE tenant_id = ?
       ORDER BY workspace_id, workflow_definition_id, workflow_definition_version`,
      [tenantId],
    );
    return rows.map((row) => ({
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      workflowDefinitionId: row.workflowDefinitionId,
      workflowDefinitionVersion: row.workflowDefinitionVersion,
      isDefault: row.isDefault === 1,
      createdBySubjectId: row.createdBySubjectId,
      createdAt: row.createdAt,
      updatedBySubjectId: row.updatedBySubjectId,
      updatedAt: row.updatedAt,
    }));
  }

'''
service = replace_once(service, method_marker, method + method_marker, "assignment export reader")
service_path.write_text(service)

roundtrip_path = Path("tests/unit/export-roundtrip.test.ts")
roundtrip = roundtrip_path.read_text()
insert_marker = '''  it("rejects unknown export versions", () => {
'''
new_tests = '''  it("accepts legacy v1 exports without workspace workflow assignments", () => {
    const source = createSyntheticExport();
    const legacy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    delete legacy.workspaceWorkflowAssignments;
    expect(parseExport(JSON.stringify(legacy)).workspaceWorkflowAssignments).toBeUndefined();
  });

  it("rejects workspace workflow assignments that cross tenant or definition boundaries", () => {
    const source = createSyntheticExport();
    const tampered = {
      ...source,
      workspaceWorkflowAssignments: [
        {
          tenantId: source.tenant.id,
          workspaceId: source.workspaces[0]!.id,
          workflowDefinitionId: "missing-workflow",
          workflowDefinitionVersion: 1,
          isDefault: true,
          createdBySubjectId: source.identitySubjects[0]!.id,
          createdAt: source.exportedAt,
          updatedBySubjectId: source.identitySubjects[0]!.id,
          updatedAt: source.exportedAt,
        },
      ],
    };
    expect(() => parseExport(JSON.stringify(tampered))).toThrow(
      /missing workflow definition version/,
    );
  });

'''
roundtrip = replace_once(roundtrip, insert_marker, new_tests + insert_marker, "export assignment tests")
roundtrip_path.write_text(roundtrip)
