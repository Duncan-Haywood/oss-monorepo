---
kind: polish
topics: [design, platform]
date: 2026-11-18
---
# Polish: audience intros short enough for "Start here" on the first phone screen

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-18-homeowners-audience.md` ("The audience intro runs to about 350 px on a phone").
Open PRs listed (`list_pull_requests`, open, 60): none touch `audiences.mjs`.

## Measured (local full build, Chromium, 390 × 844 and 1,280 × 800)

Top of the first `.start-grid li`, in page pixels, for every `dist/c/for-*/`:

- Before: 26 of 31 audience pages have a Start here row. Four were past the 844 px fold:
  homeowners 978, retirees 951, parents 951, job-changers 873. The other 22: 686 to 820.
- After: all 26 at 794 to 820. Ledes 158 to 184 px (were 263 to 368). Desktop row up 26 to 105 px.
- `scrollWidth` 390 at 390 on every page, before and after. `check.mjs`: publishable, no dead links.

The after numbers come from a full rebuild with a first, longer rewrite, then the final
wording of the four ledes (and the retirees note) patched into those four `dist` pages with the same
escaping and measured again. A full rebuild on the final wording is in the run record `notes`. The measurement script is not committed (it is
a 30-line Playwright loop over `dist/c/for-*`); if a later run needs it, it belongs in
`platform/pages/` as a fold check (see item 2).

## What changed

- `platform/pages/audiences.mjs`: intros for retirees (67 → 41 words), parents (72 → 42),
  job-changers (66 → 43), homeowners (85 → 41). Each keeps its jurisdiction sentence (US vs the
  tools marked UK / Great Britain and Australia). Retirees' `starting` 42 → 37 words.
- `platform/pages/audiences.test.mjs`: intros ≤ 45 words (the longest trade intro, roofers, is 44
  and lands at 820 px).

## Still weakest, and what I would do next

1. **Five audience pages have no Start here row at all**: childcare, ebay-sellers, etsy-sellers,
   photographers, pool-hot-tub (`renderAudienceLead` returns '' when `start` is empty). They open
   straight into the full card list, which is fine, but they are inconsistent with the other 26.
   Find out why `start` is empty for them (no tool with `pageCount > 1`?) and decide whether to fall
   back to the first three tools.
2. **A word budget is a proxy.** A browser check in `platform/pages/` that fails when the first
   tool card on any `c/for-*` page starts below 844 px at 390 would measure the real thing,
   including a long `starting` note or a long h1 (roofers sits at 820 with 24 px to spare).
3. Carried over from `polish-2026-11-18-homeowners-audience.md`: item 1 (renters page, 3 tools),
   item 3 (the `starting` note's business call-out styling; severance and residency tools in
   `backoffice`), item 4 (root `llms.txt` headroom about 4 KB).
