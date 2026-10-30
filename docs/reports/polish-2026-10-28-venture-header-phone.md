# Polish 2026-10-28: venture header full width on phones

**Weak surface.** On a phone, product pages (`/ai-bookkeeper/` and every venture page with the injected
site header) showed the header as a white box inset 16 px from each edge, with the page's grey-green
background showing at the sides of the breadcrumb row. The earlier polish report (saved-bids band) listed it.

**Cause.** `VENTURE_CHROME_JS` `fit()` widens the header to the viewport, but the widened bar had no
centring margin on a narrow screen, so content sat at x=0 and the mobile `.pfs-nav` bleed
(`margin-right:-16px`) made the page 16 px wider (scrollWidth 406 vs 390). `fit()` then undid itself, by design,
to avoid a sideways scroll. Desktop worked because the bar's `max-width:1120px` centring supplied the offset.

**Fix.** `platform/pages/site-nav.mjs`: when widening, the element's original left and right offsets become
padding (`reset()` clears them). Content stays where the host put it. Test added in `site-nav.test.mjs`.

**Measured** (Playwright, built `dist/ai-bookkeeper/`): 390 px: header style before `none` (undone), after
`width:390px; margin-left:-16px; padding 16px`, scrollWidth 390. 1280 px: `padding 80px` on both sides, same
layout as before. `node platform/pages/check.mjs` passes; site-nav tests pass.

**Still weak (next run).** Phone top nav clips "Updates" ("Upd") with no fade hint; stories card titles show
visited-link purple; hero "Built for Roofers  and" has a double gap; saved-bids band alignment and the
neutral "Save these numbers" band (see the saved-bids report). Not measured: Lighthouse, traffic.
