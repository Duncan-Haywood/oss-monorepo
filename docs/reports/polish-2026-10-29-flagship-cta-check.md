# Polish 2026-10-29: a check that keeps flagship first-screen buttons in place

**What.** Earlier polish runs added a call-to-action link under the h1 of flagship tool pages
(`ai-bookkeeper`, `shift-roster-builder`, `changepoint-detector`, and others). Nothing stopped a later
edit from dropping one. `platform/pages/flagship-cta.test.mjs` now reads `portfolio/flagships.yaml` and
fails if a flagship with a single-file `ventures/<slug>/index.html` has no `a.cta` within 2,500
characters after its h1.

**Measured.** I audited all flagships first: every one with an `index.html` already has the button, so
the previous report's "shift-roster-builder and changepoint-detector still lack one" is stale (both have
it). `photo-editing` and `quick-pick-survey` have no root `index.html`, so the test skips them. 9 tests
pass. No screenshots or Lighthouse this run; traffic and ranking are unmeasured.

**Next.** Extend the same check to non-flagship tool pages with long intros (needs a threshold decision),
and screenshot a research page and the Stories page at 390 px, which no recent polish run has done.
