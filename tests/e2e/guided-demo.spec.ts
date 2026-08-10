import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("runs the authorized persisted document lifecycle without browser-selected authority", async ({
  page,
}) => {
  await page.goto("/demo/workflow");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Walk one document through control.",
  );
  await expect(page.getByText("Template ready", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator("input")).toHaveCount(0);

  await page.getByRole("button", { name: "Create from approved template" }).click();
  await expect(page.getByText("Draft created", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Approval required", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Submit version 1 for review" }).click();
  await expect(page.getByText("In review", { exact: true })).toBeVisible();
  await expect(page.getByText(/Riley Reviewer \(Reviewer\)/)).toBeVisible();

  await page.getByRole("button", { name: "Record reviewer acceptance" }).click();
  await expect(page.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await expect(page.getByText(/Alex Approver \(Approver\)/)).toBeVisible();

  await page.getByRole("button", { name: "Approve exact version 1" }).click();
  await expect(page.getByText("Version 1 approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Exact approval applies", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create changed version 2" }).click();
  await expect(page.getByText("Version 2 changed", { exact: true })).toBeVisible();
  await expect(page.getByText("Demonstration complete", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();

  const versionCards = page.locator(".version-card");
  await expect(versionCards).toHaveCount(2);
  await expect(versionCards.nth(0).getByText("Exact approval applies")).toBeVisible();
  await expect(versionCards.nth(1).getByText("Approval required")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("rejects cross-origin guided demo mutations", async ({ request }) => {
  const response = await request.post("/demo/workflow/actions/create", {
    headers: { Origin: "https://example.invalid" },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({
    error: "Same-origin demo request required.",
  });
});
