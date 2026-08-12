import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function approveVersionOne(page: Page): Promise<string> {
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

  await page.goto("/demo/app/documents");
  const href = await page
    .getByRole("link", { name: "View evidence" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  return href ?? "";
}

test("retires an approved document while preserving evidence and blocking later work", async ({
  page,
}) => {
  const detailHref = await approveVersionOne(page);
  await page.goto(detailHref);

  const retirement = page.locator(".retirement-panel");
  await expect(
    retirement.getByRole("heading", { name: "Retire this approved document" }),
  ).toBeVisible();
  await retirement
    .getByRole("checkbox", {
      name: "I understand this document will become historical-only.",
    })
    .check();
  await retirement.getByRole("button", { name: "Retire document" }).click();

  await expect(page).toHaveURL(/\?notice=retired$/u);
  await expect(page.getByRole("status")).toContainText("Document retired.");
  await expect(
    page.getByText("Retired · evidence preserved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retired historical record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retire document" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Document · Retired", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Exact approval applies", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Standard Operating Procedure", { exact: true }),
  ).toBeVisible();

  const blockedChange = await page.request.post(
    "/demo/workflow/actions/change",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
    },
  );
  expect(blockedChange.status()).toBe(409);
  expect(await blockedChange.text()).toContain(
    "Retired documents are historical",
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("requires explicit confirmation and same-origin protection", async ({
  page,
}) => {
  const detailHref = await approveVersionOne(page);
  const retirementUrl = `${detailHref}/retire`;

  const missingConfirmation = await page.request.post(retirementUrl, {
    headers: { Origin: "http://127.0.0.1:8787" },
    form: {},
  });
  expect(missingConfirmation.status()).toBe(400);
  expect(await missingConfirmation.text()).toContain(
    "Confirm document retirement before continuing.",
  );

  const crossOrigin = await page.request.post(retirementUrl, {
    headers: { Origin: "https://example.test" },
    form: { confirmRetirement: "yes" },
  });
  expect(crossOrigin.status()).toBe(403);
});
