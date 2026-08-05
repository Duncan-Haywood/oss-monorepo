import { expect, test } from "@playwright/test";

import {
  briefDialog,
  filterButton,
  horizontalOverflow,
  isMobileLayout,
  openHomepage,
  ventureCard,
} from "./journey";

/**
 * The class of defect no other suite in this repository can reach.
 *
 * `docs/QUALITY-ENGINEERING.md`: "Assert absence of overlap, clipping,
 * horizontal overflow, layout shift, blank canvases/images, unreadable
 * contrast, and text escaping controls." Every one of those is a resolved box
 * or a resolved colour. The fake DOM has neither — `FakeElement.style` is an
 * empty object — and the responsive contract models exactly one property,
 * `display`, at `max-width` breakpoints. A card whose text overflows its
 * border, a brief taller than the phone it opens on, or a control pushed off
 * the right edge all pass both of them.
 */
test.describe("layout integrity", () => {
  test("the page does not overflow its own width", async ({ page }) => {
    await openHomepage(page);

    const offenders = await horizontalOverflow(page);
    expect(
      offenders.map((o) => `${o.selector} extends to ${Math.round(o.right)}px`).join("\n"),
      "content extends past the right edge of the viewport",
    ).toBe("");

    // The document itself must not scroll sideways either — an offender inside
    // a clipping ancestor would not appear above but still steals the gesture.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(scrolls, "the page scrolls horizontally").toBe(false);
  });

  test("every filter control can be reached and pressed at this width", async ({ page }) => {
    await openHomepage(page);

    // Below 760px `.filter-bar` becomes an `overflow-x: auto` scroller, so the
    // last filter is legitimately off-screen at rest. Being off-screen is
    // fine; being unreachable is not, and only a real browser can tell those
    // apart.
    const filters = await page
      .locator(".filter-btn")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-filter") ?? ""));

    for (const filter of filters) {
      const button = filterButton(page, filter);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("venture cards contain their own text", async ({ page }) => {
    await openHomepage(page);

    // Text escaping its card is what a font fallback, a long venture name, or
    // a narrow column produces, and it is invisible to every assertion that
    // reads the DOM rather than the rendering.
    const escaping = await page.locator(".venture-card:visible").evaluateAll((cards) =>
      cards.flatMap((card) => {
        const outer = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll<HTMLElement>(".venture-name, .venture-status, p"))
          .filter((child) => {
            const box = child.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;
            return box.right > outer.right + 1 || box.bottom > outer.bottom + 1;
          })
          .map(
            (child) =>
              `${card.getAttribute("data-venture")}: ${child.className || child.tagName} escapes its card`,
          );
      }),
    );
    expect(escaping.join("\n")).toBe("");
  });

  test("an open brief is readable without releasing the page it locked", async ({ page }) => {
    await openHomepage(page);

    const card = ventureCard(page, "quick-pick-survey");
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "Venture brief" }).click();

    const dialog = briefDialog(page);
    await expect(dialog).toBeVisible();

    // Opening the brief sets `body { overflow: hidden }`. If the brief is
    // taller than the viewport and nothing inside it scrolls, the bottom of
    // the text is unreachable: the page behind is locked and the panel itself
    // does not move. This is the phone-sized failure the fake DOM cannot have.
    const readable = await dialog.evaluate((modal) => {
      const content = modal.querySelector<HTMLElement>(".modal-content");
      if (!content) return { ok: false, why: "no .modal-content in the dialog" };

      const box = content.getBoundingClientRect();
      const fits = box.top >= -1 && box.bottom <= window.innerHeight + 1;
      if (fits) return { ok: true, why: "" };

      // Not fitting is acceptable only if something between the content and
      // the dialog actually scrolls.
      for (let node: HTMLElement | null = content; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const scrollable = /(auto|scroll)/.test(`${style.overflowY}`);
        if (scrollable && node.scrollHeight > node.clientHeight + 1) {
          return { ok: true, why: "" };
        }
        if (node === modal) break;
      }
      return {
        ok: false,
        why: `the brief spans ${Math.round(box.top)}px to ${Math.round(box.bottom)}px in a ${window.innerHeight}px viewport and nothing scrolls`,
      };
    });

    expect(readable.why).toBe("");
    expect(readable.ok).toBe(true);
  });

  test("the grid reflows to the shape this width calls for", async ({ page }) => {
    await openHomepage(page);

    const columns = await page
      .locator(".ventures-grid")
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length);

    // One column on a phone, more than one above the breakpoint. A grid that
    // stayed two-across on a 412px screen would halve every card's width and
    // is precisely what a `display`-only model cannot see.
    if (isMobileLayout(page)) {
      expect(columns, "the venture grid did not collapse to a single column").toBe(1);
    } else {
      expect(columns, "the venture grid did not lay out in columns").toBeGreaterThan(1);
    }
  });
});
