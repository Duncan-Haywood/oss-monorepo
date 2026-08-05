import { expect, test } from "@playwright/test";

import { briefDialog, closeBriefButton, openHomepage, ventureCard } from "./journey";

/**
 * Keyboard-only operation of the venture brief.
 *
 * `docs/QUALITY-ENGINEERING.md` requires keyboard-only navigation and focus
 * order/visibility to be tested. The fake-DOM suite asserts that `focus()` was
 * called and on which element, which is a different claim: its `focus()` always
 * succeeds, including on an element that is `display: none`, and it models no
 * focus ring at all. Whether a real browser moves focus, keeps it inside the
 * dialog, and paints an indicator a sighted keyboard user can follow is only
 * answerable here.
 */
test.describe("keyboard operation of a venture brief", () => {
  test("a brief can be opened from the keyboard and takes focus", async ({ page }) => {
    await openHomepage(page);

    const card = ventureCard(page, "print-atelier");
    await card.scrollIntoViewIfNeeded();
    const opener = card.getByRole("button", { name: "Venture brief" });

    // Focus the control the way a keyboard user reaches it, then activate it
    // with the key that is supposed to work rather than with a click.
    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(briefDialog(page)).toBeVisible();
    await expect(closeBriefButton(page)).toBeFocused();
  });

  test("focus stays inside the brief while it is open", async ({ page }) => {
    await openHomepage(page);

    const card = ventureCard(page, "print-atelier");
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "Venture brief" }).click();
    await expect(briefDialog(page)).toBeVisible();

    // Tab and Shift+Tab both have to land back inside the dialog. Focus
    // escaping to the page behind an `aria-modal="true"` dialog is the defect
    // that lets a keyboard user operate controls a screen reader tells them
    // are not there.
    for (const key of ["Tab", "Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      const inside = await page.evaluate(() => {
        const modal = document.getElementById("techModal");
        return modal ? modal.contains(document.activeElement) : false;
      });
      expect(inside, `focus left the open brief after pressing ${key}`).toBe(true);
    }
  });

  test("Escape closes the brief and hands focus back to the control that opened it", async ({
    page,
  }) => {
    await openHomepage(page);

    const card = ventureCard(page, "range-coach");
    await card.scrollIntoViewIfNeeded();
    const opener = card.getByRole("button", { name: "Venture brief" });

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(briefDialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(briefDialog(page)).toBeHidden();

    // Returning focus to the body would drop a keyboard user at the top of the
    // document, losing their place in a twelve-card grid.
    await expect(opener).toBeFocused();
  });

  test("the focused control is visibly marked as focused", async ({ page }) => {
    await openHomepage(page);

    const card = ventureCard(page, "print-atelier");
    await card.scrollIntoViewIfNeeded();
    const opener = card.getByRole("button", { name: "Venture brief" });

    // Reach the control by keyboard, so `:focus-visible` applies — a mouse
    // click would not match it, and the rule under test is the one that draws
    // the ring for keyboard users.
    await opener.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(opener).toBeFocused();

    const indicator = await opener.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        boxShadow: style.boxShadow,
      };
    });

    const marked =
      (indicator.outlineStyle !== "none" && indicator.outlineWidth > 0) ||
      (indicator.boxShadow !== "none" && indicator.boxShadow !== "");
    expect(
      marked,
      `the focused control draws no focus indicator: ${JSON.stringify(indicator)}`,
    ).toBe(true);
  });
});
