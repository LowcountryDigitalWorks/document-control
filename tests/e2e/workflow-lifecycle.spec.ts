import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const states = "draft\nreview\napproval\napproved";
const transitions =
  "draft -> review\nreview -> draft\nreview -> approval\napproval -> draft\napproval -> approved";

async function createSeededWorkflowV2(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/workflows");
  const seeded = page
    .locator('select[name="workflowDefinitionId"] option')
    .filter({ hasText: "Standard review and approval" });
  const id = await seeded.getAttribute("value");
  expect(id).toBeTruthy();

  const form = page.locator('form[action="/demo/app/admin/workflows/version"]');
  await form.locator('[name="workflowDefinitionId"]').selectOption(id ?? "");
  await form.locator('[name="name"]').fill("Standard review and approval v2");
  await form.locator('[name="states"]').fill(states);
  await form.locator('[name="transitions"]').fill(transitions);
  await form.getByRole("button", { name: "Create next version" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Workflow version created.",
  );
}

function versionCard(page: Page, version: 1 | 2) {
  return page
    .locator(".definition-card")
    .filter({
      hasText:
        version === 1
          ? "Standard review and approval"
          : "Standard review and approval v2",
    })
    .filter({ hasText: `v${version}` });
}

async function openWorkflowAdmin(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/workflows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Workflow Definitions",
  );
}

async function openWorkflowSelection(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/workflow-selection");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Workflow Selection",
  );
}

test("workflow lifecycle stages Legacy and Retired use without rewriting historical evidence", async ({
  page,
}) => {
  // Create a real workflow instance while seeded v1 is still the workspace default.
  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
  await page
    .getByRole("button", { name: "Submit version 1 for review" })
    .click();

  await createSeededWorkflowV2(page);
  await openWorkflowAdmin(page);

  let versionOne = versionCard(page, 1);
  const workflowDefinitionId = await versionOne
    .locator("code")
    .first()
    .textContent();
  expect(workflowDefinitionId).toBeTruthy();
  await expect(versionOne.getByText("Active", { exact: true })).toBeVisible();
  await versionOne.getByRole("button", { name: "Mark Legacy" }).click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/workflows\?notice=lifecycle$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Workflow lifecycle transition recorded.",
  );
  versionOne = versionCard(page, 1);
  await expect(versionOne.getByText("Legacy", { exact: true })).toBeVisible();
  await expect(
    versionOne.getByText(/Remove this Legacy version from every workspace/u),
  ).toBeVisible();
  await expect(versionOne.getByRole("button", { name: "Retire" })).toHaveCount(
    0,
  );

  // Retirement remains blocked while any workspace assignment still references v1.
  const blockedRetirement = await page.request.post(
    "/demo/app/admin/workflows/lifecycle",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: {
        workflowDefinitionId: workflowDefinitionId ?? "",
        workflowDefinitionVersion: "1",
        targetState: "retired",
      },
    },
  );
  expect(blockedRetirement.status()).toBe(409);
  expect(await blockedRetirement.text()).toContain(
    "Remove this workflow version from every workspace before retiring it.",
  );

  await openWorkflowSelection(page);
  versionOne = versionCard(page, 1);
  let versionTwo = versionCard(page, 2);
  await expect(versionOne.getByText("Legacy", { exact: true })).toBeVisible();
  await expect(
    versionOne.getByText("Workspace default", { exact: true }),
  ).toBeVisible();
  await expect(
    versionOne.getByText(/remains the current default/u),
  ).toBeVisible();
  await expect(versionTwo.getByText("Active", { exact: true })).toBeVisible();

  await versionTwo.getByRole("button", { name: "Make available" }).click();
  versionTwo = versionCard(page, 2);
  await versionTwo.getByRole("button", { name: "Set as default" }).click();
  versionOne = versionCard(page, 1);
  await versionOne
    .getByRole("button", { name: "Remove from workspace" })
    .click();

  await openWorkflowAdmin(page);
  versionOne = versionCard(page, 1);
  await expect(versionOne.getByText("Legacy", { exact: true })).toBeVisible();
  await versionOne.getByRole("button", { name: "Retire" }).click();
  versionOne = versionCard(page, 1);
  await expect(versionOne.getByText("Retired", { exact: true })).toBeVisible();
  await expect(versionOne.getByText(/historical evidence/u)).toBeVisible();
  await expect(versionOne.getByRole("button")).toHaveCount(0);

  // The workflow instance created before lifecycle changes remains pinned to v1.
  await page.goto("/demo/app/documents");
  const documentCard = page
    .locator(".record-card")
    .filter({ hasText: "Harbor Opening Checklist" });
  await documentCard.getByRole("link", { name: "View evidence" }).click();
  await expect(
    page.getByText("Standard review and approval · v1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Standard review and approval v2 · v2", { exact: true }),
  ).toHaveCount(0);

  await page.goto(
    "/demo/app/audit?q=workflow.definition.lifecycle_transitioned",
  );
  await expect(
    page.getByText("Workflow · Definition · Lifecycle transitioned", {
      exact: true,
    }),
  ).toHaveCount(2);
  await expect(
    page.getByText("workflow.definition.lifecycle_transitioned", {
      exact: true,
    }),
  ).toHaveCount(2);

  // Lifecycle mutation keeps the same input and same-origin protections as other admin surfaces.
  const malformed = await page.request.post(
    "/demo/app/admin/workflows/lifecycle",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: {
        workflowDefinitionId: "bad id",
        workflowDefinitionVersion: "0",
        targetState: "deleted",
      },
    },
  );
  expect(malformed.status()).toBe(400);

  const crossOrigin = await page.request.post(
    "/demo/app/admin/workflows/lifecycle",
    {
      headers: { Origin: "https://example.test" },
      form: {
        workflowDefinitionId: workflowDefinitionId ?? "blocked",
        workflowDefinitionVersion: "2",
        targetState: "deprecated",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("workflow lifecycle changes remain isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();

    await first.goto("http://127.0.0.1:8787/demo/app/admin/workflows");
    let firstV1 = versionCard(first, 1);
    await firstV1.getByRole("button", { name: "Mark Legacy" }).click();
    firstV1 = versionCard(first, 1);
    await expect(firstV1.getByText("Legacy", { exact: true })).toBeVisible();

    await second.goto("http://127.0.0.1:8787/demo/app/admin/workflows");
    const secondV1 = versionCard(second, 1);
    await expect(secondV1.getByText("Active", { exact: true })).toBeVisible();
    await expect(secondV1.getByText("Legacy", { exact: true })).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
