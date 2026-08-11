import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openAccess(page: Page): Promise<void> {
  await page.goto("/demo/app/admin/access");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Roles & Access",
  );
}

test("tenant administrator creates, assigns, and safely updates a custom workspace role", async ({
  page,
}) => {
  await openAccess(page);
  await expect(
    page.getByText(/Microsoft Entra ID \/ Active Directory/u),
  ).toBeVisible();

  const createForm = page.locator(
    'form[action="/demo/app/admin/access/roles/create"]',
  );
  await createForm.locator('input[name="name"]').fill("Records Coordinator");
  await createForm
    .locator('input[name="permission"][value="document.read"]')
    .check();
  await createForm
    .locator('input[name="permission"][value="document.review"]')
    .check();
  await createForm
    .locator('input[name="permission"][value="audit.read"]')
    .check();
  await createForm.getByRole("button", { name: "Create custom role" }).click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/access\?notice=role-created$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Custom workspace role created.",
  );
  let customRoleCard = page
    .locator(".custom-role-card")
    .filter({ hasText: "Records Coordinator" });
  await expect(customRoleCard).toHaveCount(1);
  await expect(
    customRoleCard.getByText("No current tenant assignments use this role."),
  ).toBeVisible();

  await page
    .locator('select[name="subjectId"]')
    .selectOption({ label: "Avery Author" });
  await page
    .locator('select[name="roleDefinitionId"]')
    .selectOption({ label: "Records Coordinator — custom" });
  await page.getByRole("button", { name: "Assign role" }).click();
  await expect(page.getByRole("status")).toHaveText("Workspace role assigned.");

  customRoleCard = page
    .locator(".custom-role-card")
    .filter({ hasText: "Records Coordinator" });
  await expect(
    customRoleCard.getByText(/1 current tenant assignment/u),
  ).toBeVisible();
  await expect(customRoleCard.getByText(/Avery Author —/u)).toBeVisible();

  const updateForm = customRoleCard.locator(
    'form[action="/demo/app/admin/access/roles/update"]',
  );
  await updateForm.locator('input[name="name"]').fill("Records Lead");
  await updateForm
    .locator('input[name="permission"][value="document.approve"]')
    .check();
  await updateForm.locator('input[name="acknowledgeAssignments"]').check();
  await updateForm.getByRole("button", { name: "Save custom role" }).click();

  await expect(page).toHaveURL(
    /\/demo\/app\/admin\/access\?notice=role-updated$/u,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Custom workspace role updated.",
  );
  await expect(
    page.locator("tbody tr").filter({ hasText: "Avery Author" }).filter({
      hasText: "Records Lead",
    }),
  ).toHaveCount(1);

  await page.goto("/demo/app/audit?q=role.definition.updated");
  await expect(
    page.getByText("Role · Definition · Updated", { exact: true }),
  ).toBeVisible();
});

test("custom role boundary rejects administrative grants and cross-origin mutation", async ({
  page,
}) => {
  await openAccess(page);

  const unsafe = await page.request.post(
    "/demo/app/admin/access/roles/create",
    {
      headers: {
        Origin: "http://127.0.0.1:8787",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: "name=Unsafe+Role&permission=document.read&permission=role.manage",
    },
  );
  expect(unsafe.status()).toBe(400);
  expect(await unsafe.text()).toContain(
    "not available to custom workspace roles",
  );

  const crossOrigin = await page.request.post(
    "/demo/app/admin/access/roles/create",
    {
      headers: { Origin: "https://example.test" },
      form: {
        name: "Cross Origin Role",
        permission: "document.read",
      },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

test("tenant administrator assigns and removes a workspace role with audit evidence", async ({
  page,
}) => {
  await openAccess(page);

  const membersPanel = page
    .getByRole("heading", { level: 2, name: "Members" })
    .locator("..");
  const rolesPanel = page
    .getByRole("heading", { level: 2, name: "Built-in workspace roles" })
    .locator("..");
  await expect(
    membersPanel.getByText("Avery Author", { exact: true }),
  ).toBeVisible();
  await expect(rolesPanel.getByText("Author", { exact: true })).toBeVisible();
  await expect(
    rolesPanel.getByText("Tenant Administrator", { exact: true }),
  ).toHaveCount(0);

  await page
    .locator('select[name="subjectId"]')
    .selectOption({ label: "Avery Author" });
  await page
    .locator('select[name="roleDefinitionId"]')
    .selectOption({ label: "Viewer" });
  await page.getByRole("button", { name: "Assign role" }).click();

  await expect(page).toHaveURL(/\/demo\/app\/admin\/access\?notice=assigned$/u);
  await expect(page.getByRole("status")).toHaveText("Workspace role assigned.");
  const viewerRow = page
    .locator("tbody tr")
    .filter({ hasText: "Avery Author" })
    .filter({ hasText: "Viewer" });
  await expect(viewerRow).toHaveCount(1);

  await page.goto("/demo/app/audit?q=role.binding.created");
  await expect(
    page.getByText("Role · Binding · Created", { exact: true }),
  ).toBeVisible();

  await openAccess(page);
  const removableViewerRow = page
    .locator("tbody tr")
    .filter({ hasText: "Avery Author" })
    .filter({ hasText: "Viewer" });
  await removableViewerRow
    .getByRole("button", { name: /Remove Viewer from Avery Author/u })
    .click();
  await expect(page).toHaveURL(/\/demo\/app\/admin\/access\?notice=removed$/u);
  await expect(page.getByRole("status")).toHaveText("Workspace role removed.");
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Avery Author" })
      .filter({ hasText: "Viewer" }),
  ).toHaveCount(0);

  await page.goto("/demo/app/audit?q=role.binding.removed");
  await expect(
    page.getByText("Role · Binding · Removed", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("rejects tenant-role assignment, cross-origin mutation, and self role-management removal", async ({
  page,
}) => {
  await openAccess(page);
  const firstSubject =
    (await page
      .locator('select[name="subjectId"] option')
      .nth(1)
      .getAttribute("value")) ?? "";

  const tenantRole = await page.request.post("/demo/app/admin/access/assign", {
    headers: { Origin: "http://127.0.0.1:8787" },
    form: {
      subjectId: firstSubject,
      roleDefinitionId: "role-tenant-admin",
    },
  });
  expect(tenantRole.status()).toBe(409);
  expect(await tenantRole.text()).toContain("Only a workspace-scoped role");

  const crossOrigin = await page.request.post("/demo/app/admin/access/assign", {
    headers: { Origin: "https://example.test" },
    form: {
      subjectId: firstSubject,
      roleDefinitionId: "role-viewer",
    },
  });
  expect(crossOrigin.status()).toBe(403);

  await page
    .locator('select[name="subjectId"]')
    .selectOption({ label: "Taylor Tenant Admin" });
  await page
    .locator('select[name="roleDefinitionId"]')
    .selectOption({ label: "Workspace Administrator" });
  await page.getByRole("button", { name: "Assign role" }).click();
  const selfAdminRow = page
    .locator("tbody tr")
    .filter({ hasText: "Taylor Tenant Admin" })
    .filter({ hasText: "Workspace Administrator" });
  await expect(selfAdminRow).toHaveCount(1);
  const selfBindingId =
    (await selfAdminRow
      .locator('input[name="bindingId"]')
      .getAttribute("value")) ?? "";
  const selfRemoval = await page.request.post("/demo/app/admin/access/remove", {
    headers: { Origin: "http://127.0.0.1:8787" },
    form: { bindingId: selfBindingId },
  });
  expect(selfRemoval.status()).toBe(409);
  expect(await selfRemoval.text()).toContain(
    "cannot remove their own role-management grant",
  );
  await openAccess(page);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Taylor Tenant Admin" })
      .filter({ hasText: "Workspace Administrator" }),
  ).toHaveCount(1);
});

test("keeps workspace role assignments isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/app/admin/access");
    await firstPage
      .locator('select[name="subjectId"]')
      .selectOption({ label: "Avery Author" });
    await firstPage
      .locator('select[name="roleDefinitionId"]')
      .selectOption({ label: "Viewer" });
    await firstPage.getByRole("button", { name: "Assign role" }).click();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/admin/access");
    await expect(
      secondPage
        .locator("tbody tr")
        .filter({ hasText: "Avery Author" })
        .filter({ hasText: "Viewer" }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
