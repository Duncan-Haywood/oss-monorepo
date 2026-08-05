import { expect, test } from "@playwright/test";

import { isMobileLayout, navPanel, navToggle, openHomepage } from "./journey";

/**
 * The header at both widths the projects run: a phone, where the destinations
 * live behind a disclosure button, and a desktop, where they are on screen.
 *
 * Every test here runs at both widths and asserts the branch that width is
 * supposed to take, rather than skipping on the other one. A `test.skip` keyed
 * on viewport reports green for a case it never ran, and this is the site's
 * only navigation — the failure mode is a visitor on a phone with no way to
 * reach any section of the page.
 *
 * `tests/responsive-contract.test.mjs` already resolves the `display` cascade
 * for these breakpoints by hand. That model covers one CSS property; it cannot
 * tell whether the revealed panel is actually on screen, on top of the content
 * behind it, or wide enough to touch.
 */
test.describe("navigation at phone and desktop widths", () => {
  test("the destinations are reachable, however this width presents them", async ({ page }) => {
    await openHomepage(page);
    const toggle = navToggle(page);
    const panel = navPanel(page);

    if (isMobileLayout(page)) {
      await expect(toggle).toBeVisible();
      await expect(panel).toBeHidden();

      await toggle.click();
      await expect(panel).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    } else {
      // Above the breakpoint the panel is the header itself and the disclosure
      // button is not part of the design.
      await expect(toggle).toBeHidden();
      await expect(panel).toBeVisible();
    }

    // Whichever branch we took, every destination has to be on screen with a
    // real box. The minimum height applies only to the phone panel: there the
    // links are the site's touch targets and the stylesheet gives them 15px of
    // vertical padding for that reason, while on a desktop they are pointer
    // targets sized by their own text — a 22px text link is the design, not a
    // defect, and asserting 24px at both widths would fail the desktop for
    // being what it is meant to be.
    const links = panel.locator(".nav-link");
    const count = await links.count();
    expect(count, "the navigation offers no destinations").toBeGreaterThan(0);

    const minimumHeight = isMobileLayout(page) ? 24 : 0;

    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `navigation link ${index} has no box`).not.toBeNull();
      expect(box!.width, `navigation link ${index} has no width`).toBeGreaterThan(0);
      expect(box!.height, `navigation link ${index} is too small to press`).toBeGreaterThan(
        minimumHeight,
      );
    }
  });

  test("the panel is dismissed by choosing a destination", async ({ page }) => {
    await openHomepage(page);
    const toggle = navToggle(page);
    const panel = navPanel(page);

    if (!isMobileLayout(page)) {
      // Nothing covers the page at this width, so there is nothing to dismiss.
      // Asserted rather than skipped: a panel that started covering the content
      // on a desktop would be a defect this test should catch.
      await expect(panel).toBeVisible();
      await expect(toggle).toBeHidden();
      return;
    }

    await toggle.click();
    await expect(panel).toBeVisible();

    // The open panel is absolutely positioned over the page. Following a link
    // without dismissing it leaves the visitor looking at the menu instead of
    // the section they asked for.
    await panel.locator('.nav-link[href="#ventures"]').click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape dismisses the panel and returns focus to a control that exists", async ({
    page,
  }) => {
    await openHomepage(page);
    const toggle = navToggle(page);
    const panel = navPanel(page);

    if (!isMobileLayout(page)) {
      await expect(toggle).toBeHidden();
      return;
    }

    await toggle.click();
    await expect(panel).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // `app.js` calls `toggle.focus()` here. The fake-DOM suite records that the
    // call happened; it cannot see that the element is still on screen to
    // receive it, because its `focus()` succeeds on hidden elements too.
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeFocused();
  });

  test("the state the button announces matches the panel on screen", async ({ page }) => {
    await openHomepage(page);
    const toggle = navToggle(page);
    const panel = navPanel(page);

    if (!isMobileLayout(page)) {
      await expect(toggle).toBeHidden();
      return;
    }

    // Four cycles: a toggle that drifts out of step with what it announces
    // usually does so after an odd number of presses.
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const shouldBeOpen = cycle % 2 === 0;
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", shouldBeOpen ? "true" : "false");
      if (shouldBeOpen) {
        await expect(panel).toBeVisible();
      } else {
        await expect(panel).toBeHidden();
      }
    }
  });
});
