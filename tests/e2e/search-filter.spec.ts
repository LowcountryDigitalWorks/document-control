import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function createDocument(page: Page): Promise<void> {
  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
}

async function approveVersionOne(page: Page): Promise<void> {
  await createDocument(page);
  await page
    .getByRole("button", { name: "Submit version 1 for review" })
    .click();
  await page
    .getByRole("button", { name: "Record reviewer acceptance" })
    .click();
  await page.getByRole("button", { name: "Approve exact version 1" }).click();
}

test("filters documents with bounded literal server-side search", async ({ page }) => {
  await createDocument(page);

  await page.goto(
    "/demo/app/documents?q=harbor&status=draft&approval=required",
  );
  await expect(page.getByRole("heading", { name: "Harbor Opening Checklist" })).toBeVisible();
  await expect(page.getByText("1 document matched.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Title contains")).toHaveValue("harbor");
  await expect(page.getByLabel("Status")).toHaveValue("draft");
  await expect(page.getByLabel("Current approval")).toHaveValue("required");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.goto("/demo/app/documents?q=HARBOR");
  await expect(page.getByRole("heading", { name: "Harbor Opening Checklist" })).toBeVisible();

  await page.goto("/demo/app/documents?q=harbor%25");
  await expect(page.getByRole("heading", { name: "No documents match these filters." })).toBeVisible();
});

test("filters exact current approval state as the workflow changes", async ({ page }) => {
  await approveVersionOne(page);

  await page.goto("/demo/app/documents?approval=approved&status=approved");
  await expect(page.getByRole("heading", { name: "Harbor Opening Checklist" })).toBeVisible();
  await expect(page.getByText("Current version approved", { exact: true })).toBeVisible();

  await page.goto("/demo/app/documents?approval=required");
  await expect(page.getByRole("heading", { name: "No documents match these filters." })).toBeVisible();

  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create changed version 2" }).click();
  await page.goto("/demo/app/documents?approval=required&status=draft");
  await expect(page.getByRole("heading", { name: "Harbor Opening Checklist" })).toBeVisible();
  await expect(page.getByText("Current approval required", { exact: true })).toBeVisible();
});

test("filters templates by literal name and lifecycle", async ({ page }) => {
  await page.goto("/demo/app/templates?q=procedure&lifecycle=published");

  await expect(
    page.getByRole("heading", { name: "Standard Operating Procedure" }),
  ).toBeVisible();
  await expect(page.getByText("1 template matched.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Name contains")).toHaveValue("procedure");
  await expect(page.getByLabel("Lifecycle")).toHaveValue("published");

  await page.goto("/demo/app/templates?q=procedure%25");
  await expect(page.getByRole("heading", { name: "No templates match these filters." })).toBeVisible();
});

test("rejects unsupported and oversized filters before querying", async ({ page }) => {
  let response = await page.goto("/demo/app/documents?status=deleted");
  expect(response?.status()).toBe(400);
  await expect(page.getByText("Unknown document status.", { exact: true })).toBeVisible();

  response = await page.goto("/demo/app/templates?lifecycle=archived");
  expect(response?.status()).toBe(400);
  await expect(page.getByText("Unknown template lifecycle.", { exact: true })).toBeVisible();

  response = await page.goto(`/demo/app/documents?q=${"x".repeat(101)}`);
  expect(response?.status()).toBe(400);
  await expect(
    page.getByText("Search text must be 100 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
});
