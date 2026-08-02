import { expect, test } from "@playwright/test";
import { SUCCESS_CLAIMS, castVote, chooseTop, productAlert, startAnonymousSession } from "./journey";

/**
 * What the product says when its dependencies are down.
 *
 * The repository has a documented habit of shipping flows that confirm work
 * they never performed — a signup that discarded the address and answered
 * "check your inbox", a paid tier that welcomed a caller who had not paid.
 * Unit tests did not catch either, because the tests asserted the
 * confirmation string and so pinned the false message in place.
 *
 * These journeys are the opposite assertion. They break a dependency on
 * purpose and require the screen to say so — and, just as importantly, to not
 * say anything that reads like success.
 */

test.describe("dependency failure states", () => {
  test("a failed session start is reported, not confirmed", async ({ page }) => {
    await page.route("**/api/session/start", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }),
    );

    await page.goto("/app");
    await page.getByPlaceholder("Partner's first name").fill("Robin");
    await page.getByRole("button", { name: "Start our couples check-in" }).click();

    await expect(productAlert(page)).toHaveText("Couldn't start. Try again.");
    await expect(chooseTop(page)).toHaveCount(0);
    await expect(page.locator("main")).not.toHaveText(SUCCESS_CLAIMS);
  });

  test("an answer that did not save says so", async ({ page }) => {
    await startAnonymousSession(page, "Robin");

    // Fail only the save. The card still advances — `handleAnswer` is
    // deliberately optimistic — so the visible strip is the only thing
    // standing between the person and a lost answer.
    await page.route("**/api/trials/answer", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"nope"}' }),
    );
    await page.route("**/api/financial-trials/answer", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"nope"}' }),
    );

    await chooseTop(page).click();

    await expect(productAlert(page)).toHaveText(
      "That didn't save — check your connection and tap again.",
    );
  });

  test("insights that cannot load offer a retry instead of an empty verdict", async ({ page }) => {
    await startAnonymousSession(page, "Robin");
    await castVote(page);

    await page.route("**/api/insights", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"nope"}' }),
    );
    await page.goto("/insights");

    await expect(productAlert(page)).toHaveText("Couldn't load your insights.");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    // No fabricated verdict behind the error: a ranking rendered from no data
    // would be a claim about someone's relationship that nothing supports.
    await expect(page.getByRole("heading", { name: "Your insights" })).toHaveCount(0);

    // And the retry has to actually retry.
    await page.unroute("**/api/insights");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Your insights" })).toBeVisible();
  });

  test("the health endpoints distinguish process-up from database-ready", async ({ request }) => {
    const live = await request.get("/api/health");
    expect(live.ok()).toBe(true);
    expect(await live.json()).toMatchObject({ status: "ok" });

    // `/api/health` answers without touching Postgres, so it cannot be the
    // readiness signal. If these two ever collapse into the same check, a
    // rollout would go green against a service that cannot serve a single
    // card.
    const ready = await request.get("/api/health/ready");
    expect(ready.ok()).toBe(true);
    expect(await ready.json()).toMatchObject({ status: "ready" });
  });
});
