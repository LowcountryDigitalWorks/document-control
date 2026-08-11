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
  await expect(page.getByRole("status")).toHaveText("Workflow version created.");
}

async function openSelection(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/workflow-selection");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Workflow Selection",
  );
}

test("workspace administrator selects an exact applicable default for future workflow starts", async ({
  page,
}) => {
  await createSeededWorkflowV2(page);
  await openSelection(page);

  const versionOne = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval" })
    .filter({ hasText: "v1" });
  const versionTwo = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval v2" })
    .filter({ hasText: "v2" });
  await expect(versionOne.getByText("Workspace default", { exact: true })).toBeVisible();
  await expect(versionTwo.getByText("Not applicable", { exact: true })).toBeVisible();

  await versionTwo.getByRole("button", { name: "Make available" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Workflow version made available to this workspace.",
  );
  const enabledVersionTwo = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval v2" })
    .filter({ hasText: "v2" });
  await enabledVersionTwo.getByRole("button", { name: "Set as default" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Workspace default workflow changed.",
  );
  const defaultVersionTwo = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval v2" })
    .filter({ hasText: "v2" });
  await expect(defaultVersionTwo.getByText("Workspace default", { exact: true })).toBeVisible();

  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create from approved template" }).click();
  await page.getByRole("button", { name: "Submit version 1 for review" }).click();
  await page.goto("/demo/app/documents");
  const documentCard = page
    .locator(".record-card")
    .filter({ hasText: "Harbor Opening Checklist" });
  await documentCard.getByRole("link", { name: "View evidence" }).click();
  await expect(
    page.getByText("Standard review and approval v2 · v2", { exact: true }),
  ).toBeVisible();

  await page.goto("/demo/app/audit?q=workflow.workspace");
  await expect(
    page.getByText("Workflow · Workspace applicability · Enabled", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Workflow · Workspace default · Changed", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("existing workflow instances remain pinned when the workspace default changes", async ({
  page,
}) => {
  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create from approved template" }).click();
  await page.getByRole("button", { name: "Submit version 1 for review" }).click();

  await createSeededWorkflowV2(page);
  await openSelection(page);
  const versionTwo = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval v2" })
    .filter({ hasText: "v2" });
  await versionTwo.getByRole("button", { name: "Make available" }).click();
  const enabled = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval v2" })
    .filter({ hasText: "v2" });
  await enabled.getByRole("button", { name: "Set as default" }).click();

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
});

test("default workflow cannot be removed and cross-origin mutations are denied", async ({
  page,
}) => {
  await openSelection(page);
  const defaultCard = page
    .locator(".definition-card")
    .filter({ hasText: "Standard review and approval" })
    .filter({ hasText: "v1" });
  await expect(defaultCard.getByText(/Select another applicable version/u)).toBeVisible();
  await expect(
    defaultCard.getByRole("button", { name: "Remove from workspace" }),
  ).toHaveCount(0);

  const crossOrigin = await page.request.post(
    "/demo/app/admin/workflow-selection/update",
    {
      headers: { Origin: "https://example.test" },
      form: {
        workflowDefinitionId: "blocked",
        workflowDefinitionVersion: "1",
        action: "enable",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);

  const malformed = await page.request.post(
    "/demo/app/admin/workflow-selection/update",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: {
        workflowDefinitionId: "bad id",
        workflowDefinitionVersion: "0",
        action: "delete",
      },
    },
  );
  expect(malformed.status()).toBe(400);
});

test("workspace workflow selection remains isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await createSeededWorkflowV2(first);
    await openSelection(first);
    const versionTwo = first
      .locator(".definition-card")
      .filter({ hasText: "Standard review and approval v2" })
      .filter({ hasText: "v2" });
    await versionTwo.getByRole("button", { name: "Make available" }).click();

    await second.goto("http://127.0.0.1:8787/demo/app/admin/workflow-selection");
    await expect(
      second.getByText("Standard review and approval v2", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
