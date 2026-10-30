# Polish 2026-10-28: phone top nav fade only while there is more to scroll

**Weak surface.** At 390 px the hub's top nav (9 items, scrollWidth 676 vs 374 visible) clips "Updates" and
the right-edge fade mask stayed on even after scrolling to the end, so the last item ("About") looked cut off.
Listed as still weak by the earlier polish reports.

**Fix.** `platform/pages/site-nav.mjs`: the mask width is a registered custom property `--pfs-fade` (28px),
animated to 0 over the last 40px of the nav's own scroll by a scroll-driven animation
(`animation-timeline: scroll(self inline)`, inside `@supports`). No JavaScript; browsers without support keep
the previous always-on fade.

**Measured** (Playwright/Chromium, built `dist/index.html`, 390 px): `--pfs-fade` 28px at scroll start, 0px
scrolled to end. `site-nav.test.mjs` 13/13 pass; `check.mjs` passes. Lighthouse and traffic not measured.

**Unrelated, pre-existing.** `build.test.mjs` "no page still points at the placeholder origin" fails on
`writing/every-link-in-our-llms-txt-files-resolves` and `writing/search.json` (a post that quotes the
placeholder origin); not touched by this change.

**Still weak (next run).** Saved-bids band alignment and the neutral "Save these numbers" band; a research
page, a blog post and desktop widths still not reviewed.
