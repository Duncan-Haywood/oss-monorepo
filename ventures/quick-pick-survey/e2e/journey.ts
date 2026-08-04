import { expect, type Locator, type Page, type Response } from "@playwright/test";

/**
 * The steps a first-time visitor takes, named once.
 *
 * Everything here addresses the product the way a person does — visible text
 * and roles. There is not a single `data-testid` in `src/`, and adding a set
 * of them would have meant the journeys asserting on markup this venture is
 * free to change. Text is the contract with the visitor; if it changes, a
 * failing journey is the correct outcome, not a false alarm.
 */

export const ANSWER_ENDPOINT = /\/api\/(financial-)?trials\/answer$/;

/**
 * The product's own alerts, without Next.js's route announcer.
 *
 * Next renders a permanently-empty `<div role="alert" id="__next-route-announcer__">`
 * on every page, so a bare `getByRole("alert")` matches two elements and fails
 * on strict mode instead of on the thing under test. Excluding it by id keeps
 * these assertions about what the visitor is told.
 */
export function productAlert(page: Page): Locator {
  return page.locator('[role="alert"]:not([id="__next-route-announcer__"])');
}

export function chooseTop(page: Page): Locator {
  return page.getByRole("button", { name: "Choose top" });
}

export function chooseBottom(page: Page): Locator {
  return page.getByRole("button", { name: "Choose bottom" });
}

/**
 * Waits for the *saved* answer, not for the animation.
 *
 * `handleAnswer` in `UnifiedRunner.tsx` advances the card optimistically and
 * POSTs in the background, so "the next pair appeared" proves nothing about
 * whether anything was recorded — which is the exact shape of defect the
 * repository keeps finding (a flow that confirms work it never did). Waiting
 * on the response makes each vote in these journeys an assertion that the
 * answer reached the database, and it removes every reason to sleep.
 */
export async function castVote(page: Page, side: "top" | "bottom" = "top"): Promise<Response> {
  const button = side === "top" ? chooseTop(page) : chooseBottom(page);
  await expect(button).toBeEnabled();

  const saved = page.waitForResponse(
    (response) => ANSWER_ENDPOINT.test(new URL(response.url()).pathname) && response.request().method() === "POST",
  );
  await button.click();
  const response = await saved;

  // 409 is "the server already has this answer" — a retried save, not a
  // failure. `handleAnswer` treats it as success and so does this.
  expect(
    response.ok() || response.status() === 409,
    `answer was not persisted: ${response.status()} ${response.url()}`,
  ).toBe(true);

  await dismissInsightBreak(page);
  await expect(chooseTop(page)).toBeEnabled();
  return response;
}

/**
 * From answer 15 onward an insight can interrupt the cards. None of the
 * journeys below vote that far, but a journey that quietly stopped working
 * the day someone lowered the threshold would be worse than a slow one.
 */
export async function dismissInsightBreak(page: Page): Promise<void> {
  const keepSwiping = page.getByRole("button", { name: "Keep swiping" });
  if (await keepSwiping.isVisible()) {
    await keepSwiping.click();
  }
}

/** Landing page → the first pair of cards, the way the marketing page routes it. */
export async function startAnonymousSession(page: Page, partnerName: string): Promise<void> {
  await page.goto("/");
  // The landing page repeats this call to action in the hero and again lower
  // down. Either one is the journey; taking the first is what a visitor who
  // does not scroll would do.
  await page.getByRole("link", { name: "Make your first choice" }).first().click();

  await expect(page.getByRole("heading", { name: "A clearer picture of both of you" })).toBeVisible();
  await page.getByPlaceholder("Partner's first name").fill(partnerName);
  await page.getByRole("button", { name: "Start our couples check-in" }).click();

  await expect(chooseTop(page)).toBeEnabled();
}

/**
 * Copy that must never appear on a screen reporting a failure.
 *
 * `docs/QUALITY-ENGINEERING.md` asks the journeys to cover failure states;
 * the failure that actually costs this portfolio money is the one that reads
 * like success. Asserted as an absence so a future rewrite of the error path
 * cannot reintroduce a cheerful message under a 500.
 */
export const SUCCESS_CLAIMS = /saved|you're all set|thanks for|welcome to|check your inbox|all done/i;
