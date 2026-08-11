import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openMembers(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/members");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Members");
}

test("tenant administrator stages, activates, assigns, and suspends a direct member without deleting roles", async ({
  page,
}) => {
  await openMembers(page);

  const createForm = page.locator(
    'form[action="/demo/app/admin/members/create"]',
  );
  await createForm.locator('input[name="displayName"]').fill("Jordan Smith");
  await createForm.locator('input[name="email"]').fill("jordan@example.com");
  await createForm.locator('select[name="initialStatus"]').selectOption("invited");
  await createForm.getByRole("button", { name: "Add member" }).click();

  await expect(page).toHaveURL(/\/demo\/app\/admin\/members\?notice=created$/u);
  await expect(page.getByRole("status")).toHaveText("Tenant member added.");
  let jordanCard = page.locator(".member-card").filter({ hasText: "Jordan Smith" });
  await expect(jordanCard.getByText("Staged", { exact: true })).toBeVisible();
  await expect(jordanCard.getByText("App-local / direct", { exact: true })).toBeVisible();

  await page.goto("/demo/app/admin/access");
  await expect(
    page.locator('select[name="subjectId"] option').filter({ hasText: "Jordan Smith" }),
  ).toHaveCount(0);

  await openMembers(page);
  jordanCard = page.locator(".member-card").filter({ hasText: "Jordan Smith" });
  await jordanCard.getByRole("button", { name: "Activate member" }).click();
  await expect(page.getByRole("status")).toHaveText("Membership activated.");
  jordanCard = page.locator(".member-card").filter({ hasText: "Jordan Smith" });
  await expect(jordanCard.getByText("Active", { exact: true })).toBeVisible();

  await page.goto("/demo/app/admin/access");
  await page
    .locator('select[name="subjectId"]')
    .selectOption({ label: "Jordan Smith — jordan@example.com" });
  await page.locator('select[name="roleDefinitionId"]').selectOption({ label: "Viewer" });
  await page.getByRole("button", { name: "Assign role" }).click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "Jordan Smith" }).filter({ hasText: "Viewer" }),
  ).toHaveCount(1);

  await openMembers(page);
  jordanCard = page.locator(".member-card").filter({ hasText: "Jordan Smith" });
  await expect(jordanCard.getByText(/1 total · 0 tenant · 1 workspace/u)).toBeVisible();
  await jordanCard.getByRole("button", { name: "Suspend member" }).click();
  await expect(page.getByRole("status")).toHaveText("Membership suspended.");
  jordanCard = page.locator(".member-card").filter({ hasText: "Jordan Smith" });
  await expect(jordanCard.getByText("Suspended", { exact: true })).toBeVisible();
  await expect(jordanCard.getByText(/1 total · 0 tenant · 1 workspace/u)).toBeVisible();

  await page.goto("/demo/app/admin/access");
  await expect(
    page.locator('select[name="subjectId"] option').filter({ hasText: "Jordan Smith" }),
  ).toHaveCount(0);
  await expect(
    page.locator("tbody tr").filter({ hasText: "Jordan Smith" }).filter({ hasText: "Viewer" }),
  ).toHaveCount(1);

  await page.goto("/demo/app/audit?q=tenant.membership.status_changed");
  await expect(
    page.getByText("Tenant · Membership · Status changed", { exact: true }),
  ).toBeVisible();
});

test("member lifecycle rejects cross-origin mutation and hides current-admin suspension", async ({
  page,
}) => {
  await openMembers(page);
  const selfCard = page
    .locator(".member-card")
    .filter({ hasText: "Taylor Tenant Admin" });
  await expect(
    selfCard.getByText(/cannot be suspended from this screen/u),
  ).toBeVisible();
  await expect(
    selfCard.getByRole("button", { name: "Suspend member" }),
  ).toHaveCount(0);

  const crossOrigin = await page.request.post("/demo/app/admin/members/create", {
    headers: { Origin: "https://example.test" },
    form: {
      displayName: "Blocked Member",
      email: "blocked@example.com",
      initialStatus: "active",
    },
  });
  expect(crossOrigin.status()).toBe(403);
});

test("member administration is accessible, responsive, and session isolated", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await first.goto("http://127.0.0.1:8787/demo/app/admin/members");
    const form = first.locator('form[action="/demo/app/admin/members/create"]');
    await form.locator('input[name="displayName"]').fill("Session Member");
    await form.locator('input[name="email"]').fill("session@example.com");
    await form.locator('select[name="initialStatus"]').selectOption("active");
    await form.getByRole("button", { name: "Add member" }).click();
    await expect(first.getByText("Session Member", { exact: true })).toBeVisible();

    await second.goto("http://127.0.0.1:8787/demo/app/admin/members");
    await expect(second.getByText("Session Member", { exact: true })).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page: first }).analyze();
    expect(accessibility.violations).toEqual([]);
    const dimensions = await first.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
