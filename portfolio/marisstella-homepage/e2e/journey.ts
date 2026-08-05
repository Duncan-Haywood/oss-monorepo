import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Shared vocabulary for the journeys.
 *
 * No `data-testid` anywhere, on purpose: the site ships no test hooks, and
 * adding some would make the suite assert against markup that exists only
 * because the suite exists. Locators here are what a visitor perceives —
 * roles, accessible names — falling back to the structural attributes the
 * page already uses for its own behaviour (`data-filter`, `data-venture`).
 */

/** The breakpoint `style.css` uses to swap the header for a disclosure menu. */
export const MOBILE_BREAKPOINT = 760;

export function isMobileLayout(page: Page): boolean {
  const width = page.viewportSize()?.width ?? 0;
  return width <= MOBILE_BREAKPOINT;
}

/**
 * `index.html` pulls DM Sans and Manrope from fonts.googleapis.com.
 *
 * Left alone, every assertion in this suite would depend on a third party
 * being reachable, and would resolve differently on a runner with no egress
 * than on a developer's machine — the same specs reporting different results
 * for a reason that has nothing to do with the site. The stylesheet already
 * declares `sans-serif` fallbacks, so the page is fully functional without
 * them, and nothing here asserts a text metric or a pixel.
 *
 * This is a deliberate fidelity gap: web-font loading and any layout shift it
 * causes are not covered by this suite.
 */
export async function blockExternalFonts(page: Page): Promise<void> {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
}

/** Land on the homepage with the page's own scripts wired up. */
export async function openHomepage(page: Page): Promise<void> {
  await blockExternalFonts(page);
  await page.goto("/");
  // app.js binds filtering and the menu inside DOMContentLoaded listeners. A
  // click dispatched before those run is silently dropped, which would make
  // this suite flaky in exactly the way it is supposed to detect.
  await expect(page.locator(".filter-btn.active")).toBeVisible();
}

export const filterButton = (page: Page, value: string) =>
  page.locator(`.filter-btn[data-filter="${value}"]`);

export const ventureCard = (page: Page, slug: string) =>
  page.locator(`.venture-card[data-venture="${slug}"]`);

export const briefDialog = (page: Page) => page.locator("#techModal");

export const closeBriefButton = (page: Page) =>
  page.getByRole("button", { name: "Close venture details" });

export const navToggle = (page: Page) => page.locator("#navToggle");

export const navPanel = (page: Page) => page.locator("#siteNav");

/**
 * Every filter the page offers, with the ventures each one should reveal.
 *
 * Read from the page rather than restated here, so adding a venture does not
 * silently narrow the suite. The membership test is a **token** match on
 * `data-category`, which is the rule the categories are written to express —
 * `app.js:65` implements it as `categories.includes(filter)`, a substring
 * test. The two agree today and would diverge the moment a category name
 * contains a filter name, so this is an independent oracle rather than a
 * restatement of the implementation.
 */
export async function expectedMembership(page: Page): Promise<Map<string, string[]>> {
  const cards = await page.locator(".venture-card").evaluateAll((nodes) =>
    nodes.map((node) => ({
      slug: node.getAttribute("data-venture") ?? "",
      categories: (node.getAttribute("data-category") ?? "").split(/\s+/).filter(Boolean),
    })),
  );
  const filters = await page
    .locator(".filter-btn")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-filter") ?? ""));

  expect(cards.length, "no venture cards found; the page did not render").toBeGreaterThan(0);
  expect(filters.length, "no filter controls found").toBeGreaterThan(0);

  return new Map(
    filters.map((filter) => [
      filter,
      cards
        .filter((card) => filter === "all" || card.categories.includes(filter))
        .map((card) => card.slug),
    ]),
  );
}

/** The ventures currently on screen, in DOM order. */
export async function visibleVentures(page: Page): Promise<string[]> {
  return page
    .locator(".venture-card:visible")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-venture") ?? ""));
}

/**
 * Whether the background is locked against scrolling.
 *
 * Read from the element that owns the viewport's scroll rather than by trying
 * to scroll and seeing what happens. `window.scrollTo` moves an
 * `overflow: hidden` viewport perfectly well — the property suppresses the
 * *user's* wheel, touch and scrollbar, not programmatic movement — so a
 * scroll-and-measure probe reports "still scrolls" for a lock that is working
 * and would have to be believed or explained away. This reads the mechanism
 * that produces the behaviour, in a real engine, after real cascade
 * resolution.
 *
 * `overflow-y` specifically: the stylesheet already sets `overflow-x: hidden`
 * on the body, so the shorthand never returns to `visible` and an assertion
 * against it would be unfalsifiable.
 */
export async function backgroundIsLocked(page: Page): Promise<boolean> {
  return page.evaluate(() => getComputedStyle(document.body).overflowY === "hidden");
}

/**
 * Whether the element is fully inside the viewport horizontally.
 *
 * Returned as data rather than asserted here so callers can name what
 * overflowed. `.filter-bar` is an `overflow-x: auto` scroller below 760px, so
 * a control being off-screen is not itself a defect — being unreachable is.
 */
export async function horizontalOverflow(page: Page): Promise<
  Array<{ selector: string; right: number }>
> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders: Array<{ selector: string; right: number }> = [];
    for (const node of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // A descendant of a deliberate horizontal scroller is allowed to sit
      // outside the viewport: that is what the scroller is for.
      if (node.closest(".filter-bar")) continue;
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.right > width + 1) {
        const id = node.id ? `#${node.id}` : "";
        const cls = node.className && typeof node.className === "string"
          ? `.${node.className.trim().split(/\s+/).join(".")}`
          : "";
        offenders.push({ selector: `${node.tagName.toLowerCase()}${id}${cls}`, right: box.right });
      }
    }
    return offenders;
  });
}
