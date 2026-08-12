import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const seededTemplateName = "Standard Operating Procedure";

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
    .filter({ hasText: seededTemplateName })
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
    .filter({ hasText: seededTemplateName })
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
    page.getByText(seededTemplateName, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Version 1");
  await expect(page.locator("main")).toContainText(contentHash);
  await expect(page.locator("main")).toContainText("Superseded");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("Template Manager creates a linear Draft revision from exact historical content identity", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const sourceCard = page
    .locator(".version-card")
    .filter({ hasText: seededTemplateName })
    .filter({ hasText: "Published" });
  const sourceHash =
    (await sourceCard.locator("dd code").nth(1).textContent()) ?? "";
  const sourceReference =
    (await sourceCard.locator("dd code").nth(2).textContent()) ?? "";

  const revisionForm = sourceCard.locator(".revision-form");
  await revisionForm
    .locator('textarea[name="revisionNote"]')
    .fill("Annual unchanged-content recertification");
  await revisionForm.locator('input[name="confirmUnchangedContent"]').check();
  await revisionForm
    .getByRole("button", { name: "Create draft revision" })
    .click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/templates\?notice=revision-created$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Template Draft revision created from exact historical content identity.",
  );
  const draftCard = page
    .locator(".version-card")
    .filter({ hasText: seededTemplateName })
    .filter({ hasText: "v2 · current revision" })
    .filter({ hasText: "Draft" });
  await expect(draftCard).toHaveCount(1);
  await expect(draftCard).toContainText(sourceHash);
  await expect(draftCard).toContainText(sourceReference);
  await expect(draftCard).toContainText("content identity unchanged");
  await expect(draftCard).toContainText(
    "Annual unchanged-content recertification",
  );
  await expect(
    page.getByRole("button", { name: "Create draft revision" }),
  ).toHaveCount(0);
  await expect(draftCard).toContainText("Revision in progress");

  await page.goto("/demo/app/audit?q=template.version.created");
  await expect(
    page.getByText("Template · Version · Created", { exact: true }),
  ).toBeVisible();

  await page.goto("/demo/app/admin/templates");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("template revision creation requires explicit unchanged-content confirmation and same origin", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const sourceVersionId =
    (await page
      .locator('.revision-form input[name="sourceTemplateVersionId"]')
      .first()
      .getAttribute("value")) ?? "";

  const unconfirmed = await page.request.post(
    "/demo/app/admin/templates/revisions",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      form: {
        sourceTemplateVersionId: sourceVersionId,
        revisionNote: "Annual unchanged-content recertification",
      },
    },
  );
  expect(unconfirmed.status()).toBe(400);
  expect(await unconfirmed.text()).toContain(
    "Confirm that this draft revision reuses the exact existing content identity.",
  );

  const crossOrigin = await page.request.post(
    "/demo/app/admin/templates/revisions",
    {
      headers: { Origin: "https://example.test" },
      form: {
        sourceTemplateVersionId: sourceVersionId,
        revisionNote: "Annual unchanged-content recertification",
        confirmUnchangedContent: "confirmed",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

test("retired current template version cannot create a new document", async ({
  page,
}) => {
  await openTemplateAdmin(page);
  const publishedCard = page
    .locator(".version-card")
    .filter({ hasText: seededTemplateName })
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
      .filter({ hasText: seededTemplateName });
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
        .filter({ hasText: seededTemplateName })
        .filter({ hasText: "Published" }),
    ).toHaveCount(1);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
