import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { parseExport } from "../../src/application/export";

async function approveAndChangeDocument(page: Page): Promise<void> {
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
  await page.getByRole("button", { name: "Create changed version 2" }).click();
}

test("exports the current synthetic tenant application state", async ({
  page,
}) => {
  await approveAndChangeDocument(page);

  await page.goto("/demo/app/admin/backup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Backup & Portability",
  );
  await expect(page.getByText("demo_synthetic", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Export Application Data" }),
  ).toBeVisible();
  await expect(
    page.getByText("Content binaries are not bundled in this slice.", {
      exact: false,
    }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const response = await page.request.get("/demo/app/admin/backup/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment; filename="document-control-guided-demo-[a-f0-9]+-export-v1\.json"/,
  );

  const exported = parseExport(await response.text());
  expect(exported.format).toBe("ldw.document-control.export");
  expect(exported.version).toBe(1);
  expect(exported.tenantConfiguration.permittedDataProfile).toBe(
    "demo_synthetic",
  );
  expect(exported.documents).toHaveLength(1);
  expect(exported.documentVersions).toHaveLength(2);
  expect(exported.templates).toHaveLength(1);
  expect(exported.templateVersions).toHaveLength(1);
  expect(exported.reviews).toHaveLength(1);
  expect(exported.approvals).toHaveLength(1);
  expect(exported.auditEvents.length).toBeGreaterThanOrEqual(6);

  const exportedDocument = exported.documents[0];
  expect(exportedDocument?.status).toBe("draft");
  const versions = [...exported.documentVersions].sort(
    (left, right) => left.versionNumber - right.versionNumber,
  );
  expect(exportedDocument?.currentVersionId).toBe(versions[1]?.id);
  expect(versions[0]?.changeSummary).toBe(
    "Initial version created from approved template.",
  );
  expect(versions[1]?.changeSummary).toBe(
    "Synthetic controlled version change.",
  );
  expect(exported.approvals[0]?.documentVersionId).toBe(versions[0]?.id);
  expect(exported.approvals[0]?.contentHash).toBe(versions[0]?.contentHash);
  expect(exported.approvals[0]?.documentVersionId).not.toBe(
    exportedDocument?.currentVersionId,
  );

  for (const version of [
    ...exported.documentVersions,
    ...exported.templateVersions,
  ]) {
    expect(version.contentProvider).toBe("r2");
    expect(version.contentKey).toContain(exported.tenant.id);
  }

  const tenantAdminBinding = exported.roleBindings.find((binding) =>
    exported.roleDefinitions.some(
      (role) =>
        role.id === binding.roleDefinitionId && role.key === "tenant_admin",
    ),
  );
  expect(tenantAdminBinding?.tenantId).toBe(exported.tenant.id);
  expect(tenantAdminBinding?.workspaceId).toBeUndefined();
});

test("keeps persisted tenant exports isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await firstPage.goto("http://127.0.0.1:8787/demo/workflow");
    await firstPage
      .getByRole("button", { name: "Create from approved template" })
      .click();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/admin/backup");

    const firstResponse = await firstPage.request.get(
      "http://127.0.0.1:8787/demo/app/admin/backup/export",
    );
    const secondResponse = await secondPage.request.get(
      "http://127.0.0.1:8787/demo/app/admin/backup/export",
    );
    const firstExport = parseExport(await firstResponse.text());
    const secondExport = parseExport(await secondResponse.text());

    expect(firstExport.tenant.id).not.toBe(secondExport.tenant.id);
    expect(firstExport.documents).toHaveLength(1);
    expect(secondExport.documents).toHaveLength(0);
    expect(secondExport.documentVersions).toHaveLength(0);
    expect(secondExport.approvals).toHaveLength(0);
    expect(
      secondExport.documents.some(
        (document) => document.id === firstExport.documents[0]?.id,
      ),
    ).toBe(false);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});