from pathlib import Path

path = Path("tests/e2e/reviews-approvals-queue.spec.ts")
text = path.read_text()
old = '''  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();

  await reviewCard
    .getByLabel(/Review comment/u)
'''
new = '''  await expect(
    page.getByText("0 items awaiting approval.", { exact: true }),
  ).toBeVisible();

  await page.goto("/demo/app/reviews");
  await reviewCard
    .getByLabel(/Review comment/u)
'''
if text.count(old) != 1:
    raise SystemExit("Expected reviewer return-navigation marker not found exactly once")
path.write_text(text.replace(old, new, 1))
