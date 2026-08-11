from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker missing in {path}: {old[:160]!r}")
    file.write_text(text.replace(old, new, 1))


Path("src/application/workflow-authoring.ts").write_text(r'''import type { WorkflowTransition } from "../domain/models";

export interface WorkflowGraphSummary {
  initialState: string;
  reachableStateCount: number;
  totalStateCount: number;
  terminalStates: readonly string[];
  branchingStates: readonly string[];
  hasCycle: boolean;
}

export function analyzeWorkflowGraph(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): WorkflowGraphSummary {
  const initialState = states[0] ?? "";
  const outgoing = buildOutgoing(states, transitions);
  const reachable = reachableStates(initialState, outgoing);
  const terminalStates = states.filter(
    (state) => (outgoing.get(state)?.size ?? 0) === 0,
  );
  const branchingStates = states.filter(
    (state) => (outgoing.get(state)?.size ?? 0) > 1,
  );

  return {
    initialState,
    reachableStateCount: reachable.size,
    totalStateCount: states.length,
    terminalStates,
    branchingStates,
    hasCycle: containsCycle(states, outgoing),
  };
}

export function unreachableWorkflowStates(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): readonly string[] {
  const initialState = states[0] ?? "";
  const reachable = reachableStates(initialState, buildOutgoing(states, transitions));
  return states.filter((state) => !reachable.has(state));
}

function buildOutgoing(
  states: readonly string[],
  transitions: readonly WorkflowTransition[],
): Map<string, Set<string>> {
  const outgoing = new Map<string, Set<string>>(
    states.map((state) => [state, new Set<string>()]),
  );
  for (const transition of transitions) {
    outgoing.get(transition.from)?.add(transition.to);
  }
  return outgoing;
}

function reachableStates(
  initialState: string,
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const reachable = new Set<string>();
  if (!initialState || !outgoing.has(initialState)) return reachable;
  const pending = [initialState];
  while (pending.length > 0) {
    const state = pending.pop();
    if (!state || reachable.has(state)) continue;
    reachable.add(state);
    for (const target of outgoing.get(state) ?? []) {
      if (!reachable.has(target)) pending.push(target);
    }
  }
  return reachable;
}

function containsCycle(
  states: readonly string[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (state: string): boolean => {
    if (visiting.has(state)) return true;
    if (visited.has(state)) return false;
    visiting.add(state);
    for (const target of outgoing.get(state) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(state);
    visited.add(state);
    return false;
  };

  return states.some((state) => visit(state));
}
''')

Path("src/application/workflow-definition-input.ts").write_text(r'''import type { WorkflowTransition } from "../domain/models";
import { unreachableWorkflowStates } from "./workflow-authoring";

export interface WorkflowDefinitionInput {
  name: string;
  states: readonly string[];
  transitions: readonly WorkflowTransition[];
}

export type WorkflowAuthoringMode = "create" | "version";

export interface WorkflowSourceQuery {
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
}

export class WorkflowDefinitionInputValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkflowDefinitionInputValidationError";
  }
}

const maximumNameLength = 100;
const maximumStateCount = 20;
const maximumStateLength = 40;
const maximumTransitionCount = 50;
const maximumWorkflowVersion = 1_000_000;
const statePattern = /^[a-z][a-z0-9_-]*$/u;

export function parseWorkflowDefinitionInput(
  values: URLSearchParams,
): WorkflowDefinitionInput {
  const name = requiredText(
    values.get("name"),
    "Workflow name",
    maximumNameLength,
  );
  const states = parseStates(values.get("states") ?? "");
  const transitions = parseTransitions(values.get("transitions") ?? "", states);
  const unreachable = unreachableWorkflowStates(states, transitions);
  if (unreachable.length > 0) {
    throw new WorkflowDefinitionInputValidationError(
      `Every workflow state must be reachable from the initial state "${states[0]}". Unreachable: ${unreachable.join(", ")}.`,
    );
  }
  return { name, states, transitions };
}

export function parseWorkflowAuthoringMode(
  values: URLSearchParams,
): WorkflowAuthoringMode {
  const value = (values.get("mode") ?? "").trim();
  if (value !== "create" && value !== "version") {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow authoring mode is invalid.",
    );
  }
  return value;
}

export function parseWorkflowSourceQuery(
  values: URLSearchParams,
): WorkflowSourceQuery | undefined {
  const rawId = (values.get("sourceId") ?? "").trim();
  const rawVersion = (values.get("sourceVersion") ?? "").trim();
  if (!rawId && !rawVersion) return undefined;
  if (!rawId || !rawVersion) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow source requires both an identifier and exact version.",
    );
  }
  return {
    workflowDefinitionId: validateWorkflowId(rawId),
    workflowDefinitionVersion: parseWorkflowVersion(rawVersion),
  };
}

export function parseOptionalWorkflowSourceVersion(
  values: URLSearchParams,
): number | undefined {
  const rawVersion = (values.get("sourceVersion") ?? "").trim();
  return rawVersion ? parseWorkflowVersion(rawVersion) : undefined;
}

export function parseExistingWorkflowId(values: URLSearchParams): string {
  const value = (values.get("workflowDefinitionId") ?? "").trim();
  if (!value) {
    throw new WorkflowDefinitionInputValidationError(
      "Existing workflow definition is required.",
    );
  }
  return validateWorkflowId(value);
}

function validateWorkflowId(value: string): string {
  if (value.length > 256 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new WorkflowDefinitionInputValidationError(
      "Existing workflow definition identifier is invalid.",
    );
  }
  return value;
}

function parseWorkflowVersion(value: string): number {
  const version = Number(value);
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > maximumWorkflowVersion
  ) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow source version is invalid.",
    );
  }
  return version;
}

function parseStates(serialized: string): readonly string[] {
  const states = serialized
    .split(/\r?\n/u)
    .map((state) => state.trim())
    .filter(Boolean);
  if (states.length === 0) {
    throw new WorkflowDefinitionInputValidationError(
      "At least one workflow state is required.",
    );
  }
  if (states.length > maximumStateCount) {
    throw new WorkflowDefinitionInputValidationError(
      `Workflow definitions may contain at most ${maximumStateCount} states.`,
    );
  }
  if (new Set(states).size !== states.length) {
    throw new WorkflowDefinitionInputValidationError(
      "Workflow state identifiers must be unique.",
    );
  }
  for (const state of states) {
    if (state.length > maximumStateLength || !statePattern.test(state)) {
      throw new WorkflowDefinitionInputValidationError(
        `Workflow state "${state}" must be ${maximumStateLength} characters or fewer and use lowercase letters, numbers, underscores, or hyphens, beginning with a letter.`,
      );
    }
  }
  return states;
}

function parseTransitions(
  serialized: string,
  states: readonly string[],
): readonly WorkflowTransition[] {
  const lines = serialized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > maximumTransitionCount) {
    throw new WorkflowDefinitionInputValidationError(
      `Workflow definitions may contain at most ${maximumTransitionCount} transitions.`,
    );
  }

  const stateSet = new Set(states);
  const seen = new Set<string>();
  return lines.map((line) => {
    const match = /^([a-z][a-z0-9_-]*)\s*->\s*([a-z][a-z0-9_-]*)$/u.exec(line);
    if (!match) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" must use the format from_state -> to_state.`,
      );
    }
    const from = match[1];
    const to = match[2];
    if (!from || !to || !stateSet.has(from) || !stateSet.has(to)) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" references a state that is not defined.`,
      );
    }
    const key = `${from}->${to}`;
    if (seen.has(key)) {
      throw new WorkflowDefinitionInputValidationError(
        `Transition "${line}" is duplicated.`,
      );
    }
    seen.add(key);
    return { from, to };
  });
}

function requiredText(
  value: string | null,
  label: string,
  maximumLength: number,
): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    throw new WorkflowDefinitionInputValidationError(`${label} is required.`);
  }
  if (normalized.length > maximumLength) {
    throw new WorkflowDefinitionInputValidationError(
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }
  if (
    Array.from(normalized).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new WorkflowDefinitionInputValidationError(
      `${label} cannot contain control characters.`,
    );
  }
  return normalized;
}
''')

path = "src/ui/render-workflow-definition-admin.ts"
replace_once(
    path,
    'import type { WorkflowDefinitionCatalog } from "../application/workflow-definition-admin-service";\n',
    'import type { WorkflowGraphSummary } from "../application/workflow-authoring";\nimport type { WorkflowDefinitionInput } from "../application/workflow-definition-input";\nimport type {\n  WorkflowDefinitionCatalog,\n  WorkflowDefinitionRecord,\n} from "../application/workflow-definition-admin-service";\n',
)
replace_once(
    path,
    'export function renderWorkflowDefinitionAdmin(\n  theme: ThemeConfig,\n  catalog: WorkflowDefinitionCatalog,\n  notice?: string,\n): string {\n  const families = latestDefinitions(catalog);\n',
    '''export interface WorkflowAuthoringViewState {\n  mode: "create" | "version";\n  workflowDefinitionId?: string;\n  sourceDefinition?: WorkflowDefinitionRecord;\n  draft: WorkflowDefinitionInput;\n  analysis: WorkflowGraphSummary;\n}\n\nexport function renderWorkflowDefinitionAdmin(\n  theme: ThemeConfig,\n  catalog: WorkflowDefinitionCatalog,\n  notice?: string,\n  authoring?: WorkflowAuthoringViewState,\n): string {\n  const families = latestDefinitions(catalog);\n  const createDraft =\n    authoring?.mode === "create"\n      ? authoring.draft\n      : defaultDefinitionDraft("New document workflow");\n  const versionDraft =\n    authoring?.mode === "version"\n      ? authoring.draft\n      : defaultDefinitionDraft("Updated document workflow");\n  const selectedFamilyId =\n    authoring?.mode === "version" ? authoring.workflowDefinitionId : undefined;\n''',
)
replace_once(
    path,
    '          ${definitionFields("New document workflow")}\n          <button type="submit">Create workflow v1</button>\n',
    '''          ${definitionFields(createDraft)}\n          ${authoring?.mode === "create" ? renderAnalysis(authoring.analysis) : ""}\n          <div class="authoring-actions">\n            <button type="submit">Create workflow v1</button>\n            <button class="secondary" type="submit" formaction="/demo/app/admin/workflows/analyze" name="mode" value="create">Analyze draft</button>\n          </div>\n''',
)
old_version = '''            : `<form method="post" action="/demo/app/admin/workflows/version">\n          <label>Existing workflow family\n            <select name="workflowDefinitionId" required>\n              <option value="">Select a workflow family</option>\n              ${families.map((definition) => `<option value="${escapeHtml(definition.id)}">${escapeHtml(definition.name)} — latest v${definition.version}</option>`).join("")}\n            </select>\n          </label>\n          ${definitionFields("Updated document workflow")}\n          <button type="submit">Create next version</button>\n        </form>`\n'''
new_version = '''            : `<form method="post" action="/demo/app/admin/workflows/version">\n          <label>Existing workflow family\n            <select name="workflowDefinitionId" required>\n              <option value="">Select a workflow family</option>\n              ${families.map((definition) => `<option value="${escapeHtml(definition.id)}"${definition.id === selectedFamilyId ? " selected" : ""}>${escapeHtml(definition.name)} — latest v${definition.version}</option>`).join("")}\n            </select>\n          </label>\n          ${authoring?.mode === "version" && authoring.sourceDefinition ? `<input type="hidden" name="sourceVersion" value="${authoring.sourceDefinition.version}"><p class="source-note"><strong>Starting point:</strong> ${escapeHtml(authoring.sourceDefinition.name)} v${authoring.sourceDefinition.version}. Saving creates a new immutable version; the source remains unchanged.</p>` : ""}\n          ${definitionFields(versionDraft)}\n          ${authoring?.mode === "version" ? renderAnalysis(authoring.analysis) : ""}\n          <div class="authoring-actions">\n            <button type="submit">Create next version</button>\n            <button class="secondary" type="submit" formaction="/demo/app/admin/workflows/analyze" name="mode" value="version">Analyze draft</button>\n          </div>\n        </form>`\n'''
replace_once(path, old_version, new_version)
replace_once(
    path,
    'function definitionFields(defaultName: string): string {\n  return `<label>Workflow name\n    <input name="name" required maxlength="100" value="${escapeHtml(defaultName)}" autocomplete="off">\n  </label>\n  <label>States <span>one identifier per line; first state is the initial state</span>\n    <textarea name="states" required rows="6" spellcheck="false">draft\nreview\napproval\napproved</textarea>\n  </label>\n  <label>Transitions <span>one transition per line</span>\n    <textarea name="transitions" rows="7" spellcheck="false">draft -> review\nreview -> draft\nreview -> approval\napproval -> approved</textarea>\n  </label>`;\n}\n',
    '''function definitionFields(draft: WorkflowDefinitionInput): string {\n  return `<label>Workflow name\n    <input name="name" required maxlength="100" value="${escapeHtml(draft.name)}" autocomplete="off">\n  </label>\n  <label>States <span>one identifier per line; first state is the initial state</span>\n    <textarea name="states" required rows="6" spellcheck="false">${escapeHtml(draft.states.join("\\n"))}</textarea>\n  </label>\n  <label>Transitions <span>one transition per line</span>\n    <textarea name="transitions" rows="7" spellcheck="false">${escapeHtml(draft.transitions.map((transition) => `${transition.from} -> ${transition.to}`).join("\\n"))}</textarea>\n  </label>`;\n}\n\nfunction defaultDefinitionDraft(name: string): WorkflowDefinitionInput {\n  return {\n    name,\n    states: ["draft", "review", "approval", "approved"],\n    transitions: [\n      { from: "draft", to: "review" },\n      { from: "review", to: "draft" },\n      { from: "review", to: "approval" },\n      { from: "approval", to: "approved" },\n    ],\n  };\n}\n\nfunction renderAnalysis(analysis: WorkflowGraphSummary): string {\n  const terminal =\n    analysis.terminalStates.length === 0\n      ? "None — this graph has no terminal state."\n      : analysis.terminalStates.join(", ");\n  const branching =\n    analysis.branchingStates.length === 0\n      ? "None"\n      : analysis.branchingStates.join(", ");\n  return `<section class="analysis" aria-label="Workflow draft analysis">\n    <strong>Workflow draft analysis</strong>\n    <dl>\n      <div><dt>Initial state</dt><dd><code>${escapeHtml(analysis.initialState)}</code></dd></div>\n      <div><dt>Reachable</dt><dd>${analysis.reachableStateCount} / ${analysis.totalStateCount} states</dd></div>\n      <div><dt>Terminal states</dt><dd>${escapeHtml(terminal)}</dd></div>\n      <div><dt>Branching states</dt><dd>${escapeHtml(branching)}</dd></div>\n      <div><dt>Cycle present</dt><dd>${analysis.hasCycle ? "Yes" : "No"}</dd></div>\n    </dl>\n  </section>`;\n}\n''',
)
replace_once(
    path,
    '    <div class="lifecycle-actions">${renderLifecycleActions(definition)}</div>\n',
    '    <p class="source-action"><a href="/demo/app/admin/workflows?sourceId=${encodeURIComponent(definition.id)}&amp;sourceVersion=${definition.version}#version-title">Use v${definition.version} as a starting point for a new version</a></p>\n    <div class="lifecycle-actions">${renderLifecycleActions(definition)}</div>\n',
)
replace_once(
    path,
    '.lifecycle-actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.lifecycle-actions form{margin:0}.locked,.empty{color:var(--muted)}',
    '.authoring-actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap}.analysis{border:1px solid var(--border);border-radius:12px;padding:.85rem;background:var(--muted-surface)}.analysis dl{margin:.6rem 0 0}.source-note,.source-action{color:var(--muted)}.source-action{margin:.8rem 0 0}.lifecycle-actions{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.lifecycle-actions form{margin:0}.locked,.empty{color:var(--muted)}',
)
replace_once(
    path,
    '.lifecycle-actions{align-items:stretch}.lifecycle-actions form,.lifecycle-actions button{width:100%}',
    '.authoring-actions,.lifecycle-actions{align-items:stretch}.authoring-actions button,.lifecycle-actions form,.lifecycle-actions button{width:100%}',
)

path = "src/index.ts"
replace_once(
    path,
    'import { WorkflowDefinitionAdminService } from "./application/workflow-definition-admin-service";\n',
    'import { analyzeWorkflowGraph } from "./application/workflow-authoring";\nimport { WorkflowDefinitionAdminService } from "./application/workflow-definition-admin-service";\n',
)
replace_once(
    path,
    '  parseExistingWorkflowId,\n  parseWorkflowDefinitionInput,\n  WorkflowDefinitionInputValidationError,\n',
    '  parseExistingWorkflowId,\n  parseOptionalWorkflowSourceVersion,\n  parseWorkflowAuthoringMode,\n  parseWorkflowDefinitionInput,\n  parseWorkflowSourceQuery,\n  WorkflowDefinitionInputValidationError,\n',
)
old_get = '''  try {\n    const catalog = await service.getCatalog({\n      subjectId: admin.subjectId,\n      tenantId: demo.tenantId,\n      workspaceId: demo.workspaceId,\n    });\n    const noticeValue = new URL(context.req.url).searchParams.get("notice");\n    const notice =\n      noticeValue === "created"\n        ? "Workflow definition created."\n        : noticeValue === "versioned"\n          ? "Workflow version created."\n          : noticeValue === "lifecycle"\n            ? "Workflow lifecycle transition recorded."\n            : undefined;\n    context.header("Cache-Control", "no-store");\n    return context.html(\n      renderWorkflowDefinitionAdmin(\n        await createPersistedTenantTheme(database, context.env, demo.tenantId),\n        catalog,\n        notice,\n      ),\n    );\n'''
new_get = '''  try {\n    const catalog = await service.getCatalog({\n      subjectId: admin.subjectId,\n      tenantId: demo.tenantId,\n      workspaceId: demo.workspaceId,\n    });\n    const url = new URL(context.req.url);\n    const sourceQuery = parseWorkflowSourceQuery(url.searchParams);\n    const sourceDefinition = sourceQuery\n      ? catalog.definitions.find(\n          (definition) =>\n            definition.id === sourceQuery.workflowDefinitionId &&\n            definition.version === sourceQuery.workflowDefinitionVersion,\n        )\n      : undefined;\n    if (sourceQuery && !sourceDefinition) {\n      return context.text(\n        "The requested workflow source version does not exist in this tenant.",\n        400,\n      );\n    }\n    const authoring = sourceDefinition\n      ? {\n          mode: "version" as const,\n          workflowDefinitionId: sourceDefinition.id,\n          sourceDefinition,\n          draft: {\n            name: sourceDefinition.name,\n            states: sourceDefinition.states,\n            transitions: sourceDefinition.transitions,\n          },\n          analysis: analyzeWorkflowGraph(\n            sourceDefinition.states,\n            sourceDefinition.transitions,\n          ),\n        }\n      : undefined;\n    const noticeValue = url.searchParams.get("notice");\n    const notice =\n      noticeValue === "created"\n        ? "Workflow definition created."\n        : noticeValue === "versioned"\n          ? "Workflow version created."\n          : noticeValue === "lifecycle"\n            ? "Workflow lifecycle transition recorded."\n            : undefined;\n    context.header("Cache-Control", "no-store");\n    return context.html(\n      renderWorkflowDefinitionAdmin(\n        await createPersistedTenantTheme(database, context.env, demo.tenantId),\n        catalog,\n        notice,\n        authoring,\n      ),\n    );\n'''
replace_once(path, old_get, new_get)
analyze_route = r'''
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
    const database = new D1DatabaseProvider(context.env.DOCUMENT_CONTROL_DB);
    const demo = createGuidedDemoContext(sessionId);
    await ensureGuidedDemoSeed(database, sessionId);
    const admin = await ensureGuidedTenantAdmin(database, sessionId);
    const service = createAuthorizedWorkflowDefinitionAdminService(database);
    const catalog = await service.getCatalog({
      subjectId: admin.subjectId,
      tenantId: demo.tenantId,
      workspaceId: demo.workspaceId,
    });

    let workflowDefinitionId: string | undefined;
    let sourceDefinition;
    if (mode === "version") {
      workflowDefinitionId = parseExistingWorkflowId(values);
      if (!catalog.definitions.some((definition) => definition.id === workflowDefinitionId)) {
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
        await createPersistedTenantTheme(database, context.env, demo.tenantId),
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
'''
replace_once(
    path,
    '\napp.post("/demo/app/admin/workflows/create", async (context) => {',
    analyze_route + '\napp.post("/demo/app/admin/workflows/create", async (context) => {',
)

Path("tests/unit/workflow-authoring.test.ts").write_text(r'''import { describe, expect, it } from "vitest";
import { analyzeWorkflowGraph } from "../../src/application/workflow-authoring";
import {
  parseOptionalWorkflowSourceVersion,
  parseWorkflowAuthoringMode,
  parseWorkflowDefinitionInput,
  parseWorkflowSourceQuery,
} from "../../src/application/workflow-definition-input";

describe("workflow authoring helpers", () => {
  it("summarizes reachable, terminal, branching, and cyclic graph properties", () => {
    const input = parseWorkflowDefinitionInput(
      new URLSearchParams({
        name: "Approval",
        states: "draft\nreview\napproval\napproved",
        transitions:
          "draft -> review\nreview -> draft\nreview -> approval\napproval -> approved",
      }),
    );
    expect(analyzeWorkflowGraph(input.states, input.transitions)).toEqual({
      initialState: "draft",
      reachableStateCount: 4,
      totalStateCount: 4,
      terminalStates: ["approved"],
      branchingStates: ["review"],
      hasCycle: true,
    });
  });

  it("rejects unreachable states in newly submitted drafts", () => {
    expect(() =>
      parseWorkflowDefinitionInput(
        new URLSearchParams({
          name: "Broken graph",
          states: "draft\nreview\napproved\narchive",
          transitions: "draft -> review\nreview -> approved",
        }),
      ),
    ).toThrow(
      'Every workflow state must be reachable from the initial state "draft". Unreachable: archive.',
    );
  });

  it("validates exact source queries and authoring mode", () => {
    expect(
      parseWorkflowSourceQuery(
        new URLSearchParams({
          sourceId: "workflow:approval-1",
          sourceVersion: "3",
        }),
      ),
    ).toEqual({
      workflowDefinitionId: "workflow:approval-1",
      workflowDefinitionVersion: 3,
    });
    expect(parseWorkflowSourceQuery(new URLSearchParams())).toBeUndefined();
    expect(() =>
      parseWorkflowSourceQuery(new URLSearchParams({ sourceId: "workflow:one" })),
    ).toThrow("requires both an identifier and exact version");
    expect(
      parseOptionalWorkflowSourceVersion(
        new URLSearchParams({ sourceVersion: "4" }),
      ),
    ).toBe(4);
    expect(
      parseWorkflowAuthoringMode(new URLSearchParams({ mode: "version" })),
    ).toBe("version");
    expect(() =>
      parseWorkflowAuthoringMode(new URLSearchParams({ mode: "delete" })),
    ).toThrow("authoring mode is invalid");
  });
});
''')

Path("tests/e2e/workflow-authoring.spec.ts").write_text(r'''import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("administrator clones an exact workflow version, analyzes the draft, and saves a new immutable version", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/workflows");
  const seeded = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval" })
    .filter({ hasText: "v1" });
  await seeded
    .getByRole("link", { name: "Use v1 as a starting point for a new version" })
    .click();

  await expect(page).toHaveURL(/sourceVersion=1/u);
  const versionForm = page.locator(
    'form[action="/demo/app/admin/workflows/version"]',
  );
  await expect(versionForm.locator('[name="name"]')).toHaveValue(
    "Standard review and approval",
  );
  await expect(versionForm.locator('[name="states"]')).toHaveValue(
    "draft\nreview\napproval\napproved",
  );
  await expect(page.getByText("Starting point:")).toBeVisible();
  await expect(
    page.getByLabel("Workflow draft analysis").getByText("4 / 4 states"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Workflow draft analysis").getByText("approved", {
      exact: true,
    }),
  ).toBeVisible();

  await versionForm.locator('[name="name"]').fill("Standard review refined");
  await versionForm
    .locator('[name="transitions"]')
    .fill(
      "draft -> review\nreview -> draft\nreview -> approval\napproval -> review\napproval -> approved",
    );
  await versionForm.getByRole("button", { name: "Analyze draft" }).click();
  await expect(page.getByLabel("Workflow draft analysis")).toBeVisible();
  await expect(versionForm.locator('[name="name"]')).toHaveValue(
    "Standard review refined",
  );
  await expect(
    page.getByLabel("Workflow draft analysis").getByText("Yes", { exact: true }),
  ).toBeVisible();

  await versionForm
    .getByRole("button", { name: "Create next version" })
    .click();
  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/workflows\?notice=versioned$/u,
  );
  await expect(
    page
      .locator(".definition-card")
      .filter({ hasText: "Standard review refined" })
      .filter({ hasText: "v2" }),
  ).toHaveCount(1);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("workflow authoring rejects an unreachable state and cross-origin analysis", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/workflows");
  const unreachable = await page.request.post(
    "/demo/app/admin/workflows/create",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: {
        name: "Unreachable graph",
        states: "draft\nreview\napproved\narchive",
        transitions: "draft -> review\nreview -> approved",
      },
    },
  );
  expect(unreachable.status()).toBe(400);
  expect(await unreachable.text()).toContain("Unreachable: archive");

  const crossOrigin = await page.request.post(
    "/demo/app/admin/workflows/analyze",
    {
      headers: { Origin: "https://example.test" },
      form: {
        mode: "create",
        name: "Blocked",
        states: "draft",
        transitions: "",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});
''')

replace_once(
    "README.md",
    '- immutable Workflow Definition creation/versioning;\n- workspace Workflow Selection with exact default-version assignment;\n',
    '- immutable Workflow Definition creation/versioning with exact-version draft cloning, server-side graph analysis, and unreachable-state rejection for new drafts;\n- workspace Workflow Selection with exact default-version assignment;\n',
)
replace_once(
    "README.md",
    '- Workflow definitions are immutable by version; workflow instances remain bound to the exact\n  definition version they started with.\n',
    '- Workflow definitions are immutable by version; workflow instances remain bound to the exact\n  definition version they started with. Authoring may copy an exact historical version into a new\n  editable draft, but saving always inserts a new immutable version.\n',
)

status_section = r'''### Workflow authoring improvements (synthetic/test only)

- Workflow Definition administration can use any exact existing definition version as the starting
  point for a new editable draft. Selecting a source only prefills the authoring form; the source
  definition/version remains immutable and saving continues to insert the next version in that family.
- Both new-family and next-version forms support a server-side **Analyze draft** action that performs
  no persistence and reports the initial state, reachable-state count, terminal states, branching
  states, and whether the directed graph contains a cycle.
- Newly submitted workflow drafts now reject states that cannot be reached from the first/initial
  state. This is an authoring-time safeguard only; historical workflow-definition versions are not
  rewritten or retroactively revalidated under the new rule.
- Source selection is tenant-catalog bounded and exact-version validated. The browser cannot use the
  authoring query or analysis action to cross tenant/workspace authorization boundaries.
- Analysis and authoring POSTs retain the existing same-origin and synthetic-session protections.
  Successful creation/versioning continues to use the existing dual `tenant.manage` plus
  current-workspace `workflow.manage` authorization and existing append-only audit events.
- Unit coverage verifies graph reachability, terminal/branch/cycle analysis, source-query validation,
  and authoring mode validation. Browser coverage verifies exact-version prefill, analyze-without-save,
  immutable next-version creation, unreachable-state rejection, same-origin protection, and axe
  accessibility.
- This slice does **not** add drag-and-drop/graphical authoring, conditional expressions, timers,
  scripting, automatic migration of running instances, production authentication, customer uploads,
  production Cloudflare resources, or paid services.

'''
replace_once(
    "docs/STATUS.md",
    "All app-shaped `/demo` screens remain product-shape proofs, not an authenticated production tenant\n",
    status_section + "All app-shaped `/demo` screens remain product-shape proofs, not an authenticated production tenant\n",
)
replace_once(
    "docs/STATUS.md",
    "- Richer workflow authoring beyond immutable versions, workspace selection, and controlled lifecycle.\n",
    "- Drag-and-drop/graphical workflow authoring, conditional expressions, timers, scripting, or automatic migration beyond the current immutable versioning, exact-version draft cloning/analysis, workspace selection, and controlled lifecycle.\n",
)
replace_once(
    "docs/HANDOFF.md",
    '- immutable Workflow Definition administration;\n- controlled Template Lifecycle administration;\n',
    '- immutable Workflow Definition administration with exact-version draft cloning, server-side graph analysis, and unreachable-state rejection for newly submitted drafts;\n- controlled Template Lifecycle administration;\n',
)
replace_once(
    "docs/HANDOFF.md",
    '- richer workflow authoring beyond current immutable definitions/version/lifecycle controls;\n',
    '- drag-and-drop/graphical workflow authoring, conditional expressions, timers, scripting, or automatic migration beyond the current immutable versioning, exact-version draft cloning/analysis, and lifecycle controls;\n',
)
workflow_handoff = r'''## Workflow authoring boundary

Workflow authoring remains version-oriented and server controlled.

- An administrator may choose an exact historical workflow-definition version as a starting point for
  a new draft. This is a copy-for-editing operation only; it never mutates or reactivates the source.
- Saving a next-version draft still inserts the next immutable version in the selected workflow family.
- **Analyze draft** is read-only and reports graph structure without creating audit evidence or
  persistence because no product state changes.
- Newly submitted drafts reject unreachable states from the first/initial state. Keep this safeguard at
  the authoring boundary rather than retroactively invalidating historical definitions.
- Cycles and workflows without terminal states are reported by analysis but are not categorically
  forbidden because continuous/rework workflows may intentionally use them.
- Do not silently add automatic running-instance migration, graphical scripting, conditions, timers,
  or external automation semantics without a separate design decision and invariant review.

'''
replace_once(
    "docs/HANDOFF.md",
    "## Workflow Definition lifecycle terminology\n",
    workflow_handoff + "## Workflow Definition lifecycle terminology\n",
)
