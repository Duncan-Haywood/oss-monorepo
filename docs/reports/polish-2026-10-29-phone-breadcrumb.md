# Polish 2026-10-29: one-line breadcrumb on phones

**Weak spot** (from `polish-2026-10-29-site-scan.md`): on venture pages at 390 px the breadcrumb wrapped to
three lines because the last crumb is the page title, a full sentence, pushing the content down.

**Change.** `platform/pages/site-nav.mjs` (`SITE_HEADER_CSS`): under 600 px `.pfs-crumbs` is a nowrap flex row and
the `[aria-current]` crumb takes the leftover width with an ellipsis. One shared rule, every page using the
site header. Test added in `site-nav.test.mjs`.

**Measured** (Playwright, header rendered alone at 390 px with a 100-character title): breadcrumb height
27 px (one line), `scrollWidth` 390 (no sideways scroll). I did not measure the old height on a built page
(the full build takes about 20 minutes), so the "three lines" figure is the previous run's observation.

**Not done, still weakest:** no visible "Open the tool" call-to-action in the first screen of
`ai-bookkeeper` at 390 px; the floating mic button overlaps body text. Lighthouse not run.
