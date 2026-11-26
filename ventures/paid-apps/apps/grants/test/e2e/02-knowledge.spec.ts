// Demo story (b): upload a .txt mission statement -> document ready -> proposed facts in the fact
// base -> confirm one.
import { expect, test } from "@playwright/test";
import { fixturePath, newOrgSession, orgPath, waitForApi } from "./helpers";

test("upload mission statement → ready → proposed facts → confirm one", async ({ page }) => {
  const { orgId } = await newOrgSession(page, "kb");

  await page.goto(orgPath(orgId, "/knowledge/documents"));
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

  const upload = page.getByRole("form", { name: "Upload documents" });
  await upload.getByLabel("Files to upload").setInputFiles(fixturePath("mission-statement.txt"));
  await upload.getByLabel(/what kind of document/i).selectOption({ label: "Mission statement" });
  await upload.getByRole("checkbox", { name: /I have the right to share/i }).check();

  const uploaded = waitForApi(page, "POST", new RegExp(`/api/orgs/${orgId}/documents$`));
  await upload.getByRole("button", { name: "Upload", exact: true }).click();
  const res = await uploaded;
  expect(res.ok(), `upload -> ${res.status()} ${await res.text()}`).toBe(true);

  // INLINE_JOBS=true processes the document during the request; allow for polling UIs anyway.
  const row = page.getByRole("row").filter({ hasText: /mission/i });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Ready", { exact: true })).toBeVisible({ timeout: 60_000 });

  // Fact base: the extractor proposes facts with source quotes; confirm the first one.
  await page.goto(orgPath(orgId, "/knowledge/facts"));
  await expect(page.getByRole("heading", { name: "Fact base", level: 1 })).toBeVisible();
  const proposed = page.getByRole("article").filter({ hasText: "Needs review" });
  await expect(proposed.first()).toBeVisible({ timeout: 30_000 });
  const before = await proposed.count();
  expect(before).toBeGreaterThan(0);

  const fact = proposed.first();
  const statementId = await fact.getAttribute("aria-labelledby");
  const statement = statementId
    ? ((await page.locator(`[id="${statementId}"]`).textContent()) ?? "").trim()
    : "";
  expect(statement.length).toBeGreaterThan(0);

  const confirmed = waitForApi(page, "POST", /\/facts\/[^/]+\/confirm$/);
  await fact.getByRole("button", { name: "Confirm" }).click();
  expect((await confirmed).ok()).toBe(true);

  await page.getByRole("tab", { name: /^Confirmed/ }).click();
  await expect(
    page.getByRole("article", { name: statement }).getByText("Confirmed", { exact: true }),
  ).toBeVisible();
});
