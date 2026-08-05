import { expect, test } from "@playwright/test";

import {
  backgroundIsLocked,
  briefDialog,
  closeBriefButton,
  expectedMembership,
  filterButton,
  openHomepage,
  visibleVentures,
  ventureCard,
} from "./journey";

/**
 * The primary task this site exists for: a visitor arrives, narrows the
 * portfolio to the kind of work they care about, and reads a venture brief.
 *
 * `tests/interactions.test.mjs` covers the same ground against a fake DOM, and
 * it is the faster suite. What it cannot do is dispatch a real event: the
 * twelve `onclick="openModal('…')"` attributes and `onclick="closeModal()"`
 * are never exercised there — the tests call `app.openModal(key)` directly, so
 * a typo in an inline handler, a Content-Security-Policy that refuses inline
 * script, or a control covered by another element would all pass. Everything
 * here goes through the browser.
 */
test.describe("portfolio critical journey", () => {
  test("every filter reveals exactly the ventures in that category", async ({ page }) => {
    await openHomepage(page);

    const expected = await expectedMembership(page);
    expect(expected.size, "the page offers no filters to exercise").toBeGreaterThan(1);

    for (const [filter, slugs] of expected) {
      await filterButton(page, filter).click();

      expect(
        (await visibleVentures(page)).sort(),
        `the "${filter}" filter did not reveal the ventures declaring that category`,
      ).toEqual([...slugs].sort());

      // The announced state has to agree with the screen, or a screen-reader
      // user is told a different portfolio is showing than the one that is.
      await expect(filterButton(page, filter)).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.locator('.filter-btn[aria-pressed="true"]').count(),
        "more than one filter claims to be the active one",
      ).toBe(1);
    }
  });

  test("a narrowed portfolio can always be widened again", async ({ page }) => {
    await openHomepage(page);
    const everything = await visibleVentures(page);

    await filterButton(page, "consumer").click();
    expect((await visibleVentures(page)).length).toBeLessThan(everything.length);

    await filterButton(page, "all").click();
    expect(
      await visibleVentures(page),
      "the all filter did not restore every card a narrower filter hid",
    ).toEqual(everything);
  });

  test("a venture brief opens with that venture's own content and closes cleanly", async ({
    page,
  }) => {
    await openHomepage(page);

    const slug = "range-coach";
    const card = ventureCard(page, slug);
    await card.scrollIntoViewIfNeeded();

    const name = (await card.locator(".venture-name").innerText()).trim();
    await expect(briefDialog(page)).toBeHidden();

    await card.getByRole("button", { name: "Venture brief" }).click();

    const dialog = briefDialog(page);
    await expect(dialog).toBeVisible();

    // The brief has to be about the venture whose button was pressed. A modal
    // wired to the wrong key still opens, still looks right, and describes a
    // different product to someone deciding whether to get in touch.
    await expect(dialog.locator("#modalTitle")).toContainText(name);
    await expect(dialog.locator("#modalDescription")).not.toBeEmpty();
    await expect(dialog.locator("#modalDetails li").first()).toBeVisible();

    // Locked while the brief is open, so the page behind it does not slide
    // away under a phone visitor's thumb.
    expect(await backgroundIsLocked(page), "the page behind the brief was never locked").toBe(true);

    await closeBriefButton(page).click();
    await expect(dialog).toBeHidden();

    // And released afterwards — the failure that leaves a visitor on a page
    // that will not move, with nothing on screen to explain why.
    expect(await backgroundIsLocked(page), "the page stayed locked after the brief closed").toBe(
      false,
    );
  });

  test("the brief a control opens is the brief that control names", async ({ page }) => {
    await openHomepage(page);

    // Two different cards in succession: a modal that never clears its previous
    // content passes a single-open test and fails this one.
    const dialog = briefDialog(page);
    const seen: string[] = [];

    for (const slug of ["print-atelier", "local-site-studio"]) {
      const card = ventureCard(page, slug);
      await card.scrollIntoViewIfNeeded();
      const name = (await card.locator(".venture-name").innerText()).trim();

      await card.getByRole("button", { name: "Venture brief" }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("#modalTitle")).toContainText(name);

      seen.push((await dialog.locator("#modalDescription").innerText()).trim());
      await closeBriefButton(page).click();
      await expect(dialog).toBeHidden();
    }

    expect(seen[0], "two ventures shared one brief body").not.toBe(seen[1]);
  });

  test("a reload returns the visitor to a coherent portfolio", async ({ page }) => {
    await openHomepage(page);
    const everything = await visibleVentures(page);

    await filterButton(page, "enterprise").click();
    expect((await visibleVentures(page)).length).toBeLessThan(everything.length);

    await page.reload();
    await expect(page.locator(".filter-btn.active")).toBeVisible();

    // The filter is not deep-linked — no query string, no hash, no storage —
    // so a reload is expected to restore the full portfolio. This asserts the
    // whole of that: the state resets *and* it resets to something coherent,
    // rather than to a header that says "Consumer" over twelve visible cards.
    expect(await visibleVentures(page)).toEqual(everything);
    await expect(filterButton(page, "all")).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator('.filter-btn[aria-pressed="true"]').count()).toBe(1);
  });

  test("a visitor who wants to buy something can reach a human", async ({ page }) => {
    await openHomepage(page);

    // The static contract checks a mailto: exists in the markup. Whether it is
    // *reachable* is a different question at each width: the header CTA is
    // removed below 760px and the nav collapses behind a disclosure button, so
    // a contact link can be present in the DOM and unreachable on a phone.
    const contact = page.locator('a[href^="mailto:"]');
    expect(await contact.count(), "no mailto: link on the page at all").toBeGreaterThan(0);

    const reachable = await contact.evaluateAll((nodes) =>
      nodes.filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0;
      }).length,
    );
    expect(reachable, "every way to contact the studio is hidden at this width").toBeGreaterThan(0);
  });
});
