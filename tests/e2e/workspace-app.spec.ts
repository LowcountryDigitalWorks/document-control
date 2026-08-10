import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("navigates authorized workspace overview, templates, and documents", async ({
  page,
}) => {
  await page.goto("/demo/app");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Document control at a glance.",
  );
  await expect(
    page.getByText("Synthetic workspace · read-only UI"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const overviewAxe = await new AxeBuilder({ page }).analyze();
  expect(overviewAxe.violations).toEqual([]);

  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Templates");
  await expect(
    page.getByRole("heading", { name: "Standard Operating Procedure" }),
  ).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Documents");
  await expect(
    page.getByRole("heading", {
      name: "The workspace is ready for its first controlled document.",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open guided workflow" }).click();
  await expect(page.getByText("Template ready", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
  await expect(page.getByText("Draft created", { exact: true })).toBeVisible();

  await page.goto("/demo/app/documents");
  const documentCard = page.locator(".record-card").filter({
    has: page.getByRole("heading", { name: "Harbor Opening Checklist" }),
  });
  await expect(documentCard).toBeVisible();
  await expect(
    documentCard.getByText("Current approval required", { exact: true }),
  ).toBeVisible();
  await expect(
    documentCard.getByText("Current version", { exact: true }),
  ).toBeVisible();
  await expect(documentCard.getByText("1", { exact: true })).toBeVisible();

  const documentAxe = await new AxeBuilder({ page }).analyze();
  expect(documentAxe.violations).toEqual([]);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("keeps workspace read state isolated between browser sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await Promise.all([
      firstPage.goto("http://127.0.0.1:8787/demo/workflow"),
      secondPage.goto("http://127.0.0.1:8787/demo/app/documents"),
    ]);

    await firstPage
      .getByRole("button", { name: "Create from approved template" })
      .click();
    await firstPage.goto("http://127.0.0.1:8787/demo/app/documents");
    await expect(
      firstPage.getByRole("heading", { name: "Harbor Opening Checklist" }),
    ).toBeVisible();

    await secondPage.reload();
    await expect(
      secondPage.getByRole("heading", {
        name: "The workspace is ready for its first controlled document.",
      }),
    ).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
