import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function completeChangedVersionLifecycle(page: Page): Promise<void> {
  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
  await page
    .getByRole("button", { name: "Submit version 1 for review" })
    .click();
  await page
    .getByRole("button", { name: "Record reviewer acceptance" })
    .click();
  await page.getByRole("button", { name: "Approve exact version 1" }).click();
  await page.getByRole("button", { name: "Create changed version 2" }).click();
}

test("shows the append-only workspace audit stream newest first", async ({
  page,
}) => {
  await completeChangedVersionLifecycle(page);
  await page.goto("/demo/app/audit");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit Log");
  await expect(page.getByText("Synthetic Auditor · read-only UI")).toBeVisible();
  await expect(page.getByText(/6 events shown/)).toBeVisible();

  const cards = page.locator(".audit-card");
  await expect(cards).toHaveCount(6);
  await expect(cards.nth(0)).toContainText("Document · Version · Created");
  await expect(page.getByText("Document · Created from template", { exact: true })).toBeVisible();
  await expect(page.getByText("Workflow · Started", { exact: true })).toBeVisible();
  await expect(page.getByText("Workflow · Transitioned", { exact: true })).toBeVisible();
  await expect(page.getByText("Document · Version · Reviewed", { exact: true })).toBeVisible();
  await expect(page.getByText("Document · Version · Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Alex Approver", { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("filters audit events with bounded literal search", async ({ page }) => {
  await completeChangedVersionLifecycle(page);

  await page.goto("/demo/app/audit?q=Alex%20Approver");
  await expect(page.getByText("1 event matched.", { exact: false })).toBeVisible();
  await expect(page.getByText("Document · Version · Approved", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event, entity, ID, or actor contains")).toHaveValue(
    "Alex Approver",
  );

  await page.goto("/demo/app/audit?q=workflow");
  await expect(page.getByText("2 events matched.", { exact: false })).toBeVisible();
  await expect(page.getByText("Workflow · Started", { exact: true })).toBeVisible();
  await expect(page.getByText("Workflow · Transitioned", { exact: true })).toBeVisible();

  await page.goto("/demo/app/audit?q=workflow%25");
  await expect(
    page.getByRole("heading", { name: "No audit events match this search." }),
  ).toBeVisible();

  const response = await page.goto(`/demo/app/audit?q=${"x".repeat(101)}`);
  expect(response?.status()).toBe(400);
  await expect(
    page.getByText("Audit search text must be 100 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("keeps workspace audit history isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/workflow");
    await firstPage
      .getByRole("button", { name: "Create from approved template" })
      .click();
    await firstPage.goto("http://127.0.0.1:8787/demo/app/audit");
    await expect(firstPage.getByText("1 event shown.", { exact: false })).toBeVisible();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/audit");
    await expect(secondPage.getByText("0 events shown.", { exact: false })).toBeVisible();
    await expect(
      secondPage.getByText("Document · Created from template", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
