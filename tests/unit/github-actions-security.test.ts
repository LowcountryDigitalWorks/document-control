import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ciWorkflowUrl = new URL(
  "../../.github/workflows/ci.yml",
  import.meta.url,
);
const dependabotUrl = new URL(
  "../../.github/dependabot.yml",
  import.meta.url,
);

describe("GitHub Actions supply-chain posture", () => {
  it("pins every permanent CI action to an immutable commit SHA", async () => {
    const workflow = await readFile(ciWorkflowUrl, "utf8");
    const references = Array.from(
      workflow.matchAll(/^\s*- uses:\s+([^\s#]+)/gmu),
      (match) => match[1],
    );

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/u);
    }
    expect(workflow).not.toMatch(/\buses:\s+[^\s#]+@v\d+/u);
  });

  it("keeps checkout credentials disabled and the validation token read-only", async () => {
    const workflow = await readFile(ciWorkflowUrl, "utf8");
    const checkoutCount = workflow.match(/uses: actions\/checkout@/gu)?.length ?? 0;
    const disabledCredentialCount =
      workflow.match(/persist-credentials: false/gu)?.length ?? 0;

    expect(checkoutCount).toBeGreaterThan(0);
    expect(disabledCredentialCount).toBe(checkoutCount);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toMatch(/^\s+[a-z-]+:\s+write\s*$/gmu);
    expect(workflow).not.toContain("pull_request_target");
  });

  it("keeps Dependabot enabled for pinned GitHub Action updates", async () => {
    const dependabot = await readFile(dependabotUrl, "utf8");

    expect(dependabot).toContain("package-ecosystem: github-actions");
    expect(dependabot).toContain("interval: monthly");
  });
});
