// Demo story (c): start an onboarding interview -> answer 2 questions -> finish -> facts extracted.
import { expect, test } from "@playwright/test";
import { newOrgSession, orgPath, waitForApi } from "./helpers";

const ANSWERS = [
  "Mesa Ridge Community Pantry was founded in 2012 in Farmington, New Mexico. Our mission is to end hunger in rural San Juan County.",
  "In 2025 we distributed 412,000 pounds of food to 3,150 households through 14 mobile pantry routes, with 9 staff and 220 volunteers.",
];

test("onboarding interview → answer 2 questions → finish → facts extracted", async ({ page }) => {
  const { orgId } = await newOrgSession(page, "interview");

  await page.goto(orgPath(orgId, "/interviews"));
  await expect(page.getByRole("heading", { name: "Interviews", level: 1 })).toBeVisible();

  const started = waitForApi(page, "POST", new RegExp(`/api/orgs/${orgId}/interviews$`));
  await page.getByRole("button", { name: /start onboarding interview/i }).click();
  const startRes = await started;
  expect(startRes.ok(), `start interview -> ${startRes.status()} ${await startRes.text()}`).toBe(
    true,
  );
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgId}/interviews/[^/?#]+$`));

  const transcript = page.getByRole("list", { name: "Interview transcript" });
  await expect(transcript.getByRole("listitem").first()).toBeVisible(); // AI asked the first question

  const composer = page.getByLabel("Your answer");
  for (const text of ANSWERS) {
    await composer.fill(text);
    const answered = waitForApi(page, "POST", /\/interviews\/[^/]+\/answer$/);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const res = await answered;
    expect(res.ok(), `answer -> ${res.status()} ${await res.text()}`).toBe(true);
    await expect(transcript).toContainText(text.slice(0, 40));
    await expect(composer).toHaveValue("");
  }

  const completed = waitForApi(page, "POST", /\/interviews\/[^/]+\/complete$/);
  await page.getByRole("button", { name: /finish interview/i }).click();
  const doneRes = await completed;
  expect(doneRes.ok(), `complete -> ${doneRes.status()} ${await doneRes.text()}`).toBe(true);

  await expect(page.getByRole("status").filter({ hasText: /extracted \d+ facts?/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /review proposed facts/i })).toBeVisible();
});
