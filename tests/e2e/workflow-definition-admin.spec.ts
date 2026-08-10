import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const states = "draft\nreview\napproval\napproved";
const transitions =
  "draft -> review\nreview -> draft\nreview -> approval\napproval -> approved";

async function openWorkflowAdmin(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/workflows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Workflow Definitions",
  );
}

test("tenant administrator creates an immutable workflow family and next version", async ({
  page,
}) => {
  await openWorkflowAdmin(page);
  await expect(
    page.getByText("Standard review and approval", { exact: true }).first(),
  ).toBeVisible();

  const createForm = page.locator(
    'form[action="/demo/app/admin/workflows/create"]',
  );
  await createForm.locator('[name="name"]').fill("Records Review");
  await createForm.locator('[name="states"]').fill(states);
  await createForm.locator('[name="transitions"]').fill(transitions);
  await createForm.getByRole("button", { name: "Create workflow v1" }).click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/workflows\?notice=created$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Workflow definition created.",
  );
  const createdCard = page
    .locator(".definition-card")
    .filter({ hasText: "Records Review" })
    .filter({ hasText: "v1" });
  await expect(createdCard).toHaveCount(1);
  const createdId = await createdCard.locator("code").first().textContent();
  expect(createdId).toBeTruthy();

  const versionForm = page.locator(
    'form[action="/demo/app/admin/workflows/version"]',
  );
  await versionForm
    .locator('[name="workflowDefinitionId"]')
    .selectOption(createdId ?? "");
  await versionForm.locator('[name="name"]').fill("Records Review Revised");
  await versionForm.locator('[name="states"]').fill(states);
  await versionForm
    .locator('[name="transitions"]')
    .fill(`${transitions}\napproval -> review`);
  await versionForm
    .getByRole("button", { name: "Create next version" })
    .click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/workflows\?notice=versioned$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Workflow version created.",
  );
  await expect(
    page
      .locator(".definition-card")
      .filter({ hasText: "Records Review Revised" })
      .filter({ hasText: "v2" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".definition-card")
      .filter({ hasText: "Records Review" })
      .filter({ hasText: "v1" }),
  ).toHaveCount(1);

  await page.goto("/demo/app/audit?q=workflow.definition");
  await expect(
    page.getByText("Workflow · Definition · Created", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Workflow · Definition · Version created", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("a newly created seeded-workflow version does not silently change the guided workflow binding", async ({
  page,
}) => {
  await openWorkflowAdmin(page);
  const seededFamilyOption = page
    .locator('select[name="workflowDefinitionId"] option')
    .filter({ hasText: "Standard review and approval" });
  const seededId = await seededFamilyOption.getAttribute("value");
  expect(seededId).toBeTruthy();

  const versionForm = page.locator(
    'form[action="/demo/app/admin/workflows/version"]',
  );
  await versionForm
    .locator('[name="workflowDefinitionId"]')
    .selectOption(seededId ?? "");
  await versionForm
    .locator('[name="name"]')
    .fill("Standard review and approval v2");
  await versionForm.locator('[name="states"]').fill(states);
  await versionForm.locator('[name="transitions"]').fill(transitions);
  await versionForm
    .getByRole("button", { name: "Create next version" })
    .click();

  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
  await page
    .getByRole("button", { name: "Submit version 1 for review" })
    .click();
  await page.goto("/demo/app/documents");
  const documentCard = page
    .locator(".record-card")
    .filter({ hasText: "Harbor Opening Checklist" });
  await expect(documentCard).toHaveCount(1);
  await documentCard.getByRole("link", { name: "View evidence" }).click();
  await expect(
    page.getByText("Standard review and approval · v1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Standard review and approval v2 · v2", { exact: true }),
  ).toHaveCount(0);
});

test("rejects malformed and cross-origin workflow administration requests", async ({
  page,
}) => {
  await openWorkflowAdmin(page);

  const invalid = await page.request.post("/demo/app/admin/workflows/create", {
    headers: { Origin: "http://127.0.0.1:8787" },
    form: {
      name: "Invalid workflow",
      states: "draft\napproved",
      transitions: "draft -> review",
    },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain(
    "references a state that is not defined",
  );

  const crossOrigin = await page.request.post(
    "/demo/app/admin/workflows/create",
    {
      headers: { Origin: "https://example.test" },
      form: { name: "Blocked", states: "draft", transitions: "" },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

test("keeps workflow definition administration isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/app/admin/workflows");
    const form = firstPage.locator(
      'form[action="/demo/app/admin/workflows/create"]',
    );
    await form.locator('[name="name"]').fill("First Session Workflow");
    await form.locator('[name="states"]').fill("draft\napproved");
    await form.locator('[name="transitions"]').fill("draft -> approved");
    await form.getByRole("button", { name: "Create workflow v1" }).click();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/admin/workflows");
    await expect(
      secondPage.getByText("First Session Workflow", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
