import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openTemplateAdmin(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/templates");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Template Lifecycle",
  );
}

test("Template Manager supersedes a published version without changing existing document provenance", async ({
  page,
}) => {
  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();

  await page.goto("/demo/app/documents");
  const documentCard = page
    .locator(".record-card")
    .filter({ hasText: "Harbor Opening Checklist" });
  await expect(documentCard).toHaveCount(1);
  const evidenceHref = await documentCard
    .getByRole("link", { name: "View evidence" })
    .getAttribute("href");
  expect(evidenceHref).toBeTruthy();

  await openTemplateAdmin(page);
  const templateCard = page
    .locator(".version-card")
    .filter({ hasText: "Harbor opening checklist" })
    .filter({ hasText: "Published" });
  await expect(templateCard).toHaveCount(1);
  const contentHash =
    (await templateCard.locator("dd code").nth(1).textContent()) ?? "";
  expect(contentHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
  await expect(templateCard).toContainText("Source documents");
  await expect(templateCard).toContainText("1");

  await templateCard
    .locator('select[name="targetState"]')
    .selectOption("superseded");
  await templateCard
    .getByRole("button", { name: "Apply lifecycle transition" })
    .click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/templates\?notice=transitioned$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Template lifecycle transition recorded.",
  );
  const supersededCard = page
    .locator(".version-card")
    .filter({ hasText: "Harbor opening checklist" })
    .filter({ hasText: "Superseded" });
  await expect(supersededCard).toHaveCount(1);
  await expect(supersededCard).toContainText(contentHash);
  await expect(supersededCard).toContainText("1");

  await page.goto("/demo/app/audit?q=template.version.lifecycle_transitioned");
  await expect(
    page.getByText("Template · Version · Lifecycle transitioned", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto(evidenceHref ?? "/demo/app/documents");
  await expect(
    page.getByText("Harbor opening checklist", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Version 1");
  await expect(page.locator("main")).toContainText(contentHash);
  await expect(page.locator("main")).toContainText("superseded");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("retired current template version cannot create a new document", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const publishedCard = page
    .locator(".version-card")
    .filter({ hasText: "Harbor opening checklist" })
    .filter({ hasText: "Published" });
  await publishedCard
    .locator('select[name="targetState"]')
    .selectOption("retired");
  await publishedCard
    .getByRole("button", { name: "Apply lifecycle transition" })
    .click();

  const response = await page.request.post("/demo/workflow/actions/create", {
    headers: { Origin: "http://127.0.0.1:8787" },
  });
  expect(response.status()).toBe(409);
  expect(await response.text()).toContain(
    "Documents can only be created from an approved template version.",
  );
});

test("rejects invalid and cross-origin template lifecycle requests", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const versionId =
    (await page
      .locator('.version-card input[name="templateVersionId"]')
      .first()
      .getAttribute("value")) ?? "";

  const invalid = await page.request.post(
    "/demo/app/admin/templates/transition",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: { templateVersionId: versionId, targetState: "deleted" },
    },
  );
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain(
    "Template lifecycle target is invalid.",
  );

  const crossOrigin = await page.request.post(
    "/demo/app/admin/templates/transition",
    {
      headers: { Origin: "https://example.test" },
      form: { templateVersionId: versionId, targetState: "superseded" },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

test("keeps template lifecycle state isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/app/admin/templates");
    const firstCard = firstPage
      .locator(".version-card")
      .filter({ hasText: "Harbor opening checklist" });
    await firstCard
      .locator('select[name="targetState"]')
      .selectOption("superseded");
    await firstCard
      .getByRole("button", { name: "Apply lifecycle transition" })
      .click();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/admin/templates");
    await expect(
      secondPage
        .locator(".version-card")
        .filter({ hasText: "Harbor opening checklist" })
        .filter({ hasText: "Published" }),
    ).toHaveCount(1);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
