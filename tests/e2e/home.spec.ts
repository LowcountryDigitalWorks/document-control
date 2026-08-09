import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("demonstrates that a changed version requires a new approval", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Document Control/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Approve the exact version. Keep the evidence.",
  );
  await expect(page.getByText("Prior approval does not apply")).toBeVisible();
  await expect(page.getByText("New approval required")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("serves a versioned synthetic export", async ({ request }) => {
  const response = await request.get("/demo/export");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");

  const exported = await response.json();
  expect(exported).toMatchObject({
    format: "ldw.document-control.export",
    version: 1,
    tenant: { name: "Harbor Works Demo" },
  });
  expect(exported.documentVersions).toHaveLength(2);
  expect(exported.approvals).toHaveLength(1);
});

test("serves every same-origin link", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) =>
      links
        .map((link) => (link as HTMLAnchorElement).href)
        .filter((href) => href.startsWith(window.location.origin)),
    );

  for (const href of new Set(hrefs)) {
    const response = await request.get(href);
    expect(response.ok(), `${href} returned ${response.status()}`).toBe(true);
  }
});

test("has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("fits the configured viewport without horizontal scrolling", async ({
  page,
}) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
