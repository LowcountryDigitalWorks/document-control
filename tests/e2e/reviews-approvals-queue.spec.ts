import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function createAndSubmitForReview(page: Page): Promise<void> {
  await page.goto("/demo/workflow");
  await page
    .getByRole("button", { name: "Create from approved template" })
    .click();
  await page
    .getByRole("button", { name: "Submit version 1 for review" })
    .click();
}

test("moves the exact current version through reviewer and approver queues", async ({
  page,
}) => {
  await page.goto("/demo/app/reviews");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Reviewer queue",
  );
  await expect(
    page.getByText("0 items awaiting review.", { exact: true }),
  ).toBeVisible();

  await createAndSubmitForReview(page);
  await page.goto("/demo/app/reviews");

  const reviewCard = page.locator(".queue-card").filter({
    has: page.getByRole("heading", { name: "Harbor Opening Checklist" }),
  });
  await expect(reviewCard).toBeVisible();
  await expect(
    reviewCard.getByText("Awaiting review", { exact: true }),
  ).toBeVisible();
  await expect(
    reviewCard.getByText("Version 1", { exact: true }),
  ).toBeVisible();
  await expect(
    reviewCard.getByText(/Standard review and approval · v1/),
  ).toBeVisible();

  const reviewAxe = await new AxeBuilder({ page }).analyze();
  expect(reviewAxe.violations).toEqual([]);
  const reviewDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reviewDimensions.scrollWidth).toBeLessThanOrEqual(
    reviewDimensions.clientWidth,
  );

  await page.getByRole("link", { name: "Approver queue" }).click();
  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();

  await page.goto("/demo/app/reviews");
  await reviewCard
    .getByLabel(/Review comment/u)
    .fill("Queue-native reviewer acceptance.");
  await reviewCard.getByRole("button", { name: "Accept version 1" }).click();
  await expect(
    page.getByText(
      "Review accepted. The exact current version moved to approval.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("0 items awaiting review.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Approver queue" }).click();

  const approvalCard = page.locator(".queue-card").filter({
    has: page.getByRole("heading", { name: "Harbor Opening Checklist" }),
  });
  await expect(approvalCard).toBeVisible();
  await expect(
    approvalCard.getByText("Awaiting approval", { exact: true }),
  ).toBeVisible();
  await expect(
    approvalCard.getByText("Version 1", { exact: true }),
  ).toBeVisible();

  await approvalCard.getByRole("checkbox").check();
  await approvalCard
    .getByRole("button", { name: "Approve exact version 1" })
    .click();
  await expect(
    page.getByText(
      "Exact current version approved. Approval evidence is preserved in the document record.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();

  await page.goto("/demo/workflow");
  await page.getByRole("button", { name: "Create changed version 2" }).click();
  await page.goto("/demo/app/reviews");
  await expect(
    page.getByText("0 items awaiting review.", { exact: true }),
  ).toBeVisible();
  await page.goto("/demo/app/approvals");
  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();
});

test("keeps review work isolated between synthetic sessions", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await createAndSubmitForReview(firstPage);
    await firstPage.goto("http://127.0.0.1:8787/demo/app/reviews");
    await expect(
      firstPage.getByRole("heading", { name: "Harbor Opening Checklist" }),
    ).toBeVisible();

    await secondPage.goto("http://127.0.0.1:8787/demo/app/reviews");
    await expect(
      secondPage.getByText("0 items awaiting review.", { exact: true }),
    ).toBeVisible();
    await expect(
      secondPage.getByRole("heading", { name: "Harbor Opening Checklist" }),
    ).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("records requested changes from the reviewer queue and preserves the comment as evidence", async ({
  page,
}) => {
  await createAndSubmitForReview(page);
  await page.goto("/demo/app/reviews");
  const reviewCard = page.locator(".queue-card").filter({
    has: page.getByRole("heading", { name: "Harbor Opening Checklist" }),
  });
  await reviewCard
    .getByLabel(/Review comment/u)
    .fill("Please update the opening verification steps.");
  await reviewCard.getByRole("button", { name: "Request changes" }).click();

  await expect(
    page.getByText(
      "Changes requested. The workflow returned to Draft and the review item cleared.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("0 items awaiting review.", { exact: true }),
  ).toBeVisible();
  await page.goto("/demo/app/approvals");
  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();
  await page.goto("/demo/app/documents");
  await page.getByRole("link", { name: "View evidence" }).click();
  await expect(
    page.getByText("changes requested", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Please update the opening verification steps.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("rejects cross-origin reviewer queue mutations", async ({ page }) => {
  await createAndSubmitForReview(page);
  await page.goto("/demo/app/reviews");
  const action = await page
    .locator(".queue-card form")
    .first()
    .getAttribute("action");
  expect(action).toBeTruthy();

  const response = await page.request.post(
    action ?? "/demo/app/reviews/missing/decision",
    {
      headers: { Origin: "https://attacker.invalid" },
      form: { decision: "accepted", comment: "Cross-origin attempt" },
    },
  );
  expect(response.status()).toBe(403);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Harbor Opening Checklist" }),
  ).toBeVisible();
});
