import AxeBuilder from "@axe-core/playwright";
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
    page
      .getByLabel("Workflow draft analysis")
      .getByText("Yes", { exact: true }),
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
