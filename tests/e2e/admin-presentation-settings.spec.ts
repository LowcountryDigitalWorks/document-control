import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const updatedValues = {
  workspaceName: "Client Library",
  appName: "Records Hub",
  companyName: "Harbor Office",
  primary: "#234567",
  secondary: "#336699",
  accent: "#995522",
  workspaceTerm: "Project Space",
  documentTerm: "Controlled File",
  approvalTerm: "Sign-off",
};

async function updatePresentationSettings(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/settings");
  for (const [name, value] of Object.entries(updatedValues)) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  await page
    .getByRole("button", { name: "Save presentation settings" })
    .click();
}

test("tenant administrator updates persisted workspace presentation", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/settings");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administration",
  );
  await expect(
    page.getByText("Synthetic demo only", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[name="workspaceName"]')).toHaveValue(
    "Operations",
  );
  await expect(page.locator('[name="companyName"]')).toHaveValue(
    "Lowcountry Digital Works",
  );

  await updatePresentationSettings(page);
  await expect(page).toHaveURL(/\/demo\/app\/admin\/settings\?saved=1$/u);
  await expect(page.getByRole("status")).toHaveText(
    "Presentation settings saved.",
  );
  await expect(
    page.getByText("Harbor Office · Records Hub", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Project Space · Controlled File · Sign-off", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/demo/app");
  await expect(page.getByText("Harbor Office", { exact: true })).toBeVisible();
  await expect(page.getByText("Records Hub", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("Client Library");
  await expect(
    page.getByRole("link", { name: "Controlled Files", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reviews & Sign-offs", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-primary")
        .trim(),
    ),
  ).toBe("#234567");

  await page.goto("/demo/app/audit?q=presentation_settings");
  await expect(
    page.getByText("Tenant · Presentation settings · Updated", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("rejects invalid settings and cross-origin administration posts", async ({
  page,
}) => {
  await page.goto("/demo/app/admin/settings");

  const invalid = await page.request.post("/demo/app/admin/settings", {
    headers: { Origin: "http://127.0.0.1:8787" },
    form: {
      ...updatedValues,
      primary: "red; background:url(https://example.test)",
    },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain(
    "Primary color must be a six-digit hexadecimal color",
  );

  const crossOrigin = await page.request.post("/demo/app/admin/settings", {
    headers: { Origin: "https://example.test" },
    form: updatedValues,
  });
  expect(crossOrigin.status()).toBe(403);

  await page.goto("/demo/app/admin/settings");
  await expect(page.locator('[name="primary"]')).toHaveValue("#163b45");
});

test("keeps presentation settings isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/app/admin/settings");
    await updatePresentationSettings(firstPage);

    await secondPage.goto("http://127.0.0.1:8787/demo/app/admin/settings");
    await expect(secondPage.locator('[name="workspaceName"]')).toHaveValue(
      "Operations",
    );
    await expect(secondPage.locator('[name="companyName"]')).toHaveValue(
      "Lowcountry Digital Works",
    );
    await expect(secondPage.locator('[name="documentTerm"]')).toHaveValue(
      "Document",
    );
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
