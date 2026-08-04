import { expect, test } from "@playwright/test";
import { castVote, chooseTop, productAlert, startAnonymousSession } from "./journey";

/**
 * The primary task: an anonymous visitor arrives, compares some pairs, and
 * gets something back for it. If this suite only ever held one file, it would
 * be this one — every other journey is a way this one can go wrong.
 */

test.describe("anonymous critical journey", () => {
  test("landing page offers the primary task without an account", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Easy to choose.");
    await expect(page.getByText("No registration required to try")).toBeVisible();

    const start = page.getByRole("link", { name: "Make your first choice" }).first();
    await expect(start).toBeVisible();
    await expect(start).toHaveAttribute("href", "/app");
  });

  test("a partner name is required before the cards appear", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "A clearer picture of both of you" })).toBeVisible();

    await page.getByRole("button", { name: "Start our couples check-in" }).click();

    await expect(productAlert(page)).toHaveText(
      "Enter your partner's name to make this check-in personal.",
    );
    // Still on the welcome screen: the validation refused, it did not merely complain.
    await expect(chooseTop(page)).toHaveCount(0);
  });

  test("votes are recorded, survive a reload, and are counted on the insights screen", async ({ page }) => {
    const votes = 4;
    await startAnonymousSession(page, "Robin");

    await expect(page.getByText("Focus: Your relationship with Robin")).toBeVisible();

    for (let i = 0; i < votes; i += 1) {
      await castVote(page, i % 2 === 0 ? "top" : "bottom");
    }

    // Reload behaviour: the session lives in localStorage, so a refresh must
    // land back on the cards. Dropping someone to the welcome screen mid-flow
    // would silently restart their session and orphan the answers above.
    await page.reload();
    await expect(chooseTop(page)).toBeEnabled();
    await expect(page.getByRole("heading", { name: "A clearer picture of both of you" })).toHaveCount(0);

    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Your insights" })).toBeVisible();
    // Server-derived, not read back out of the browser: this is the assertion
    // that the four votes exist in the database and not just in React state.
    await expect(page.getByText(`${votes} answered`)).toBeVisible();
  });

  test("undo takes back the last answer", async ({ page }) => {
    await startAnonymousSession(page, "Sam");

    const undo = page.getByRole("button", { name: "Undo last answer" });
    await expect(undo).toBeDisabled();

    await castVote(page);
    await expect(undo).toBeEnabled();

    const undone = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/trials/undo" && response.request().method() === "POST",
    );
    await undo.click();
    expect((await undone).ok()).toBe(true);

    await page.goto("/insights");
    // One vote in, one vote out. If undo only cleared the button state, this
    // screen would still be counting an answer the person took back.
    await expect(page.getByRole("heading", { name: "Your insights" })).toBeVisible();
    await expect(page.getByText("0 answered")).toBeVisible();
  });

  test("the keyboard reaches the same task as the cards", async ({ page }) => {
    await startAnonymousSession(page, "Alex");

    const saved = page.waitForResponse(
      (response) =>
        /\/api\/(financial-)?trials\/answer$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "POST",
    );
    await page.keyboard.press("ArrowLeft");
    expect((await saved).ok()).toBe(true);

    await expect(chooseTop(page)).toBeEnabled();
  });
});
