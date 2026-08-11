import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("tenant administrator removes assignments and terminally retires a custom role", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/access");
  const createForm = page.locator(
    'form[action="/demo/app/admin/access/roles/create"]',
  );
  await createForm.locator('input[name="name"]').fill("Retirement Candidate");
  await createForm
    .locator('input[name="permission"][value="document.read"]')
    .check();
  await createForm.getByRole("button", { name: "Create custom role" }).click();

  await page
    .locator('select[name="subjectId"]')
    .selectOption({ label: "Avery Author" });
  await page
    .locator('select[name="roleDefinitionId"]')
    .selectOption({ label: "Retirement Candidate — custom" });
  await page.getByRole("button", { name: "Assign role" }).click();

  let card = page
    .locator(".custom-role-card")
    .filter({ hasText: "Retirement Candidate" });
  await expect(
    card.getByText(/retirement unavailable.*remove every tenant assignment/iu),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Retire custom role" }),
  ).toHaveCount(0);

  const assignment = page
    .locator("tbody tr")
    .filter({ hasText: "Avery Author" })
    .filter({ hasText: "Retirement Candidate" });
  await assignment
    .getByRole("button", {
      name: "Remove Retirement Candidate from Avery Author",
    })
    .click();

  card = page
    .locator(".custom-role-card")
    .filter({ hasText: "Retirement Candidate" });
  await card.getByRole("button", { name: "Retire custom role" }).click();
  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/access\?notice=role-retired$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Custom workspace role retired.",
  );

  card = page
    .locator(".custom-role-card")
    .filter({ hasText: "Retirement Candidate" });
  await expect(
    card.getByText("Retired custom role", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(/historical definition only/iu)).toBeVisible();
  await expect(
    card.locator('form[action="/demo/app/admin/access/roles/update"]'),
  ).toHaveCount(0);
  await expect(
    page
      .locator('select[name="roleDefinitionId"] option')
      .filter({ hasText: "Retirement Candidate" }),
  ).toHaveCount(0);

  await page.goto("/demo/app/audit?q=role.definition.retired");
  await expect(
    page.getByText("Role · Definition · Retired", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("custom role retirement rejects cross-origin mutation", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/access");
  const response = await page.request.post(
    "/demo/app/admin/access/roles/retire",
    {
      headers: { Origin: "https://example.test" },
      form: { roleDefinitionId: "role-custom-example" },
    },
  );
  expect(response.status()).toBe(403);
});
