# Polish 2026-10-29: one-line breadcrumb on phones

**Weak surface.** The previous scan (`polish-2026-10-29-site-scan.md`) found that product pages at 390 px
opened with a three-line breadcrumb, because the current page's full title wrapped
(`overflow-wrap:anywhere`). On a long title the header pushed the page's first action below the fold.

**Fix.** `platform/pages/site-nav.mjs`, `SITE_HEADER_CSS`: at 600 px and narrower `.pfs-crumbs` is a
no-wrap flex row; "Home" and the linked crumbs keep their size, and the `aria-current` crumb shrinks and
ends in an ellipsis. The text stays in the DOM, so screen readers and crawlers still read the full title.
Shared header, so it reaches the hub-linked tool pages, research pages and venture pages at once.
Test: `site-nav.test.mjs`, "on a phone the breadcrumb stays on one line".

**Measured** (Playwright, real `renderSiteHeader` plus CSS, 390 px, a 64-character page title):
crumb row height 27 px (one line), `scrollWidth` 390 (no sideways scroll), current crumb truncated.
I did not re-measure the "before" height from a full build (about 20 minutes here); the previous scan
saw three lines. `node --test platform/pages/site-nav.test.mjs`: 15 pass. Not measured: Lighthouse,
traffic, ranking.

**Still weak (next run).**
1. First-screen call-to-action on flagship venture pages at 390 px (start with `ai-bookkeeper`): about
   600 px of paragraph before any "Open the tool" button.
2. The floating mic button overlaps body text on that page.
3. `missing_llms_txt.py` lists many tools; check which are flagships.
