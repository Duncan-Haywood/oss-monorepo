// Quote follow-up: a sent quote gets its first follow-up day from the shop's setting, shows on the
// quote log's "Follow up" card as coming up, and the estimator logs a follow-up on the quote page
// with a note and "No more follow-ups"; the log keeps the note and the quote leaves the list.
import { expect, test } from "@playwright/test";
import type { QuoteDetailDto, RateCardDto } from "../../src/shared/api";
import { addDays } from "../../src/shared/time-zone";
import { addBasicRateCard, api, signUpWithShop } from "./helpers";

test("a sent quote is scheduled for follow-up, and a logged follow-up is kept", async ({
  page,
  baseURL,
}) => {
  const { orgId, orgPath } = await signUpWithShop(page, {
    tag: "follow-up",
    shop: "E2E Follow-up",
  });
  await addBasicRateCard(page);
  const base = baseURL ?? "";
  const call = <T>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, base, method, `/api/orgs/${orgId}${path}`, data);

  const rc = await call<RateCardDto>("GET", "/rate-card");
  const q = await call<QuoteDetailDto>("POST", "/quotes", {
    customerCompany: "Follow Co",
    customerContact: "Pat Buyer",
  });
  await call("POST", `/quotes/${q.id}/lines`, {
    partNumber: "FU-1",
    revision: "A",
    inputs: {
      quantities: [10],
      material: {
        materialId: rc.materials[0]?.id as string,
        blank: { shape: "weight", weightLb: 2 },
        partsPerStock: null,
      },
      operations: [
        {
          machineId: rc.machines[0]?.id as string,
          label: "OP10",
          setupMinutes: 60,
          cycleMinutesPerPart: 12,
        },
      ],
    },
  });
  const sent = await call<QuoteDetailDto>("POST", `/quotes/${q.id}/send`);
  expect(sent.followUpOn).not.toBeNull();
  const due = sent.followUpOn as string;

  // The quote log: nothing due yet, one coming up this week.
  await page.goto(orgPath);
  const card = page.locator("section").filter({ hasText: "Follow up" }).first();
  await expect(page.getByText("No sent quotes are due for a follow-up today.")).toBeVisible();
  await page.getByRole("button", { name: /Show 1 coming up in the next 7 days/ }).click();
  await expect(card.getByText(due)).toBeVisible();
  await expect(card).toContainText("Follow Co");

  // The quote page: next follow-up day, then log a call and stop following up.
  await page.goto(`${orgPath}/quotes/${q.id}`);
  await expect(page.getByText(`Next follow-up ${due}.`)).toBeVisible();
  await page.getByLabel("What happened").fill("Called Pat; award goes out next month");
  await page.getByLabel("Next follow-up").selectOption("none");
  await page.getByRole("button", { name: "Log follow-up" }).click();
  await expect(page.getByText("No follow-up planned.")).toBeVisible();
  await expect(page.getByText("Called Pat; award goes out next month")).toBeVisible();
  await expect(page.getByText(/no more follow-ups/)).toBeVisible();

  // Off the list; the next follow-up day in the form never goes before tomorrow.
  await page.goto(orgPath);
  await expect(page.getByText("No sent quotes are due for a follow-up today.")).toBeVisible();
  await expect(page.getByRole("button", { name: /coming up/ })).toHaveCount(0);
  expect(due >= addDays(new Date().toISOString().slice(0, 10), 1)).toBe(true);
});
