import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function approveVersionOne(page: Page): Promise<void> {
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
  await expect(
    page.getByText("Version 1 approved", { exact: true }),
  ).toBeVisible();
}

test("shows exact-version workflow, approval, template, and audit evidence", async ({
  page,
}) => {
  await approveVersionOne(page);
  await page.goto("/demo/app/documents");
  await page.getByRole("link", { name: "View evidence" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Harbor Opening Checklist",
  );
  await expect(
    page.getByText("Synthetic evidence · controlled lifecycle"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Standard Operating Procedure" }),
  ).toBeVisible();
  await expect(page.getByText(/Template version 1 · Published/)).toBeVisible();
  await expect(
    page.getByText("Current version approved", { exact: true }),
  ).toBeVisible();

  const versionOne = page.locator(".version-card").filter({
    has: page.getByText("Version 1", { exact: true }),
  });
  await expect(
    versionOne.getByRole("heading", { name: "Current version" }),
  ).toBeVisible();
  await expect(
    versionOne.getByText("Exact approval applies", { exact: true }),
  ).toBeVisible();
  await expect(
    versionOne.getByText("Riley Reviewer", { exact: false }),
  ).toBeVisible();
  await expect(
    versionOne.getByText("Alex Approver", { exact: false }),
  ).toBeVisible();
  await expect(
    versionOne.getByText(/Standard review and approval · v1/),
  ).toBeVisible();
  await expect(versionOne.getByText(/State: approved/)).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Audit timeline" }),
  ).toBeVisible();
  await expect(
    page.getByText("Document · Created from template", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Workflow · Started", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Workflow · Transitioned", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Document · Version · Reviewed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Document · Version · Approved", { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create changed version 2" }).click();
  await page.goto("/demo/app/documents");
  await page.getByRole("link", { name: "View evidence" }).click();
  await expect(
    page.getByText("Synthetic controlled version change.", { exact: true }),
  ).toBeVisible();

  await expect(
    page.getByText("Current approval required", { exact: true }),
  ).toBeVisible();
  const versionCards = page.locator(".version-card");
  await expect(versionCards).toHaveCount(2);
  await expect(
    versionCards.nth(0).getByRole("heading", { name: "Historical version" }),
  ).toBeVisible();
  await expect(
    versionCards.nth(0).getByText("Exact approval applies", { exact: true }),
  ).toBeVisible();
  await expect(
    versionCards.nth(1).getByRole("heading", { name: "Current version" }),
  ).toBeVisible();
  await expect(
    versionCards.nth(1).getByText("Approval required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Document · Version · Created", { exact: true }),
  ).toBeVisible();
});

test("does not reveal another synthetic session's document detail", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    await firstPage.goto("http://127.0.0.1:8787/demo/workflow");
    await firstPage
      .getByRole("button", { name: "Create from approved template" })
      .click();
    await firstPage.goto("http://127.0.0.1:8787/demo/app/documents");
    const detailHref = await firstPage
      .getByRole("link", { name: "View evidence" })
      .getAttribute("href");
    expect(detailHref).toBeTruthy();

    const secondPage = await secondContext.newPage();
    const response = await secondPage.goto(
      `http://127.0.0.1:8787${detailHref ?? ""}`,
    );
    expect(response?.status()).toBe(404);
    await expect(secondPage.getByRole("heading", { level: 1 })).toHaveText(
      "That page is not here.",
    );

    const exportResponse = await secondPage.request.get(
      `http://127.0.0.1:8787${detailHref ?? ""}/evidence.json`,
    );
    expect(exportResponse.status()).toBe(404);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("exports a versioned per-document evidence manifest with exact historical approval semantics", async ({
  page,
}) => {
  await approveVersionOne(page);
  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create changed version 2" }).click();
  await page.goto("/demo/app/documents");
  const detailHref = await page
    .getByRole("link", { name: "View evidence" })
    .getAttribute("href");
  expect(detailHref).toBeTruthy();
  await page.goto(detailHref ?? "/demo/app/documents");

  const exportLink = page.getByRole("link", {
    name: "Download evidence manifest (JSON)",
  });
  await expect(exportLink).toHaveAttribute(
    "href",
    `${detailHref}/evidence.json`,
  );

  const response = await page.request.get(`${detailHref}/evidence.json`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["content-disposition"]).toContain(
    'filename="document-evidence.json"',
  );

  const manifest = (await response.json()) as {
    format: string;
    document: {
      title: string;
      currentVersionId?: string;
      sourceTemplate?: { versionNumber: number; contentHash: string };
      versions: Array<{
        versionNumber: number;
        isCurrent: boolean;
        exactApprovalApplies: boolean;
        approvals: unknown[];
      }>;
      auditEvents: Array<{
        eventType: string;
        evidence: Record<string, unknown>;
      }>;
    };
  };
  expect(manifest.format).toBe("document-evidence/v1");
  expect(manifest.document.title).toBe("Harbor Opening Checklist");
  expect(manifest.document.sourceTemplate?.versionNumber).toBe(1);
  expect(manifest.document.versions).toHaveLength(2);
  expect(manifest.document.versions[0]).toMatchObject({
    versionNumber: 1,
    isCurrent: false,
    exactApprovalApplies: true,
  });
  expect(manifest.document.versions[0]?.approvals).toHaveLength(1);
  expect(manifest.document.versions[1]).toMatchObject({
    versionNumber: 2,
    isCurrent: true,
    exactApprovalApplies: false,
  });
  expect(
    manifest.document.auditEvents.some(
      (event) => event.eventType === "document.version.created",
    ),
  ).toBe(true);

  const serialized = JSON.stringify(manifest);
  expect(serialized).not.toContain("actorSubjectId");
  expect(serialized).not.toContain("createdBySubjectId");
  expect(serialized).not.toContain("tenantId");
  expect(serialized).not.toContain("payload");
});
