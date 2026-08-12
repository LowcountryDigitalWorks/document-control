import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const templateName = "Standard Operating Procedure";
const templateHash = `sha256:${"a".repeat(64)}`;

test("opens immutable template evidence from the ordinary Templates list", async ({
  page,
}) => {
  await page.goto("/demo/app/templates");
  const templateCard = page.locator(".record-card").filter({
    has: page.getByRole("heading", { name: templateName }),
  });
  await expect(templateCard).toBeVisible();
  const evidenceLink = templateCard.getByRole("link", {
    name: "View template evidence",
  });
  await expect(evidenceLink).toBeVisible();
  await evidenceLink.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    templateName,
  );
  await expect(
    page.getByRole("link", { name: "Templates", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const version = page.locator(".version-card").filter({
    has: page.getByText("Version 1", { exact: true }),
  });
  await expect(version).toHaveCount(1);
  await expect(version).toContainText("Current version");
  await expect(version).toContainText("Published");
  await expect(version).toContainText("Avery Author");
  await expect(version).toContainText(templateHash);
  await expect(version).toContainText(
    "Synthetic LDW guided document-control demonstration",
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("shows a new current Draft revision while preserving exact historical template evidence", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/templates");
  const sourceCard = page
    .locator(".version-card")
    .filter({ hasText: templateName })
    .filter({ hasText: "Published" });
  const revisionForm = sourceCard.locator(".revision-form");
  await revisionForm
    .locator('textarea[name="revisionNote"]')
    .fill("Annual unchanged-content recertification");
  await revisionForm.locator('input[name="confirmUnchangedContent"]').check();
  await revisionForm
    .getByRole("button", { name: "Create draft revision" })
    .click();

  await page.goto("/demo/app/templates");
  await page
    .locator(".record-card")
    .filter({ hasText: templateName })
    .getByRole("link", { name: "View template evidence" })
    .click();

  const current = page.locator(".version-card").filter({
    has: page.getByText("Version 2", { exact: true }),
  });
  const historical = page.locator(".version-card").filter({
    has: page.getByText("Version 1", { exact: true }),
  });
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Current version");
  await expect(current).toContainText("Draft");
  await expect(current).toContainText(templateHash);
  await expect(current).toContainText("content identity unchanged");
  await expect(current).toContainText(
    "Annual unchanged-content recertification",
  );
  await expect(historical).toHaveCount(1);
  await expect(historical).toContainText("Historical version");
  await expect(historical).toContainText("Published");
  await expect(historical).toContainText(templateHash);
});

test("does not reveal another synthetic session's template evidence", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    await firstPage.goto("http://127.0.0.1:8787/demo/app/templates");
    const href = await firstPage
      .locator(".record-card")
      .filter({ hasText: templateName })
      .getByRole("link", { name: "View template evidence" })
      .getAttribute("href");
    expect(href).toBeTruthy();

    const secondPage = await secondContext.newPage();
    const response = await secondPage.goto(
      `http://127.0.0.1:8787${href ?? "/demo/app/templates/missing"}`,
    );
    expect(response?.status()).toBe(404);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
