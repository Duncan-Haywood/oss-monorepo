---
kind: polish
topics: [design, seo]
date: 2026-11-16
---
# Polish: the five longest tool-page ledes, and a 120-word budget that keeps them short

Date: 2026-11-16. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-16-einvoice-lede.md` ("Other tool heroes with the same wall"). Open PRs searched
(`polish in:title`, `lede in:title`): #11730, #14012, #12397, none touch these pages.

## What was wrong

New scanner `platform/pages/hero-lede.mjs` counts the words in the first `<p>` under each
`ventures/*/index.html` h1 (1,358 pages). Five ran past 120 words. Each was the same shape: one
or two sentences on what the tool does, then every cross-link and feature caveat appended to that
same paragraph ("See … Compare … Formatting a … instead? …").

## What changed

| page | before (words) | after | how |
|---|---|---|---|
| where-to-sell-calculator | 179 | 78 | lede of three sentences; the five extra things it counts (Reverb, returns, monthly cash, days to sell, shelf value) in `<details>`; the four "vs." paragraphs merged into one sentence with the same four links |
| ada-title-ii-evidence | 154 | 44 | lede keeps the deadline link; four sibling-tool links in a muted list below |
| import-landed-cost-calculator | 134 | 59 | two sentences; de minimis, formal-entry and two "vs." links in a list |
| s3-bucket-exposure-check | 128 | 84 | the "contents never fetched" and "only buckets you own" lines stay in the lede; the guide and vs links move to a note line |
| lomb-scargle-periodogram | 121 | 106 | tightened wording; same citations and claims |

Every link the pages had is still there (the venture tests that require them pass). No claim was
added. `hero-lede.test.mjs` now fails any tool page whose lede passes 120 words
(`HERO_LEDE_MAX_WORDS`), with no exceptions list needed, since none are over after this change.

## Measured (two full local builds, Playwright, 900 px tall viewport)

Lede = height of that paragraph; input = top of the first visible input/textarea/select in `main`.

| page | 390 lede | 390 input | 1,280 lede | 1,280 input |
|---|---|---|---|---|
| where-to-sell-calculator | 552 → 240 | 1,391 → 849 | 264 → 120 | 941 → 687 |
| ada-title-ii-evidence | 576 → 168 | 949 → 830 | 216 → 72 | 812 → **838** |
| import-landed-cost-calculator | 432 → 192 | 1,052 → 1,007 | 216 → 96 | 763 → 762 |
| s3-bucket-exposure-check | 475 → 326 | 829 → 762 | 177 → 126 | 513 → 500 |
| lomb-scargle-periodogram | 422 → 397 | 1,034 → 1,009 | 149 → 149 | 586 → 586 |

`scrollWidth` equals the viewport on all ten. The ADA page's input sits 26 px lower at 1,280:
four list items take more height than the same text run together across a wide column. That
trade is deliberate. The lede now reads in one look, and the links are scannable. At 390 the
input is 119 px higher. Where-to-sell's input is now 542 px higher on a phone.

Screenshots: `img/polish-2026-11-16-hero-walls-{where-to-sell-calculator,s3-bucket-exposure-check}-{before,after}-390.png`.

## Still weakest, and what I would do next

1. **72 tool ledes sit between 91 and 120 words** (`node platform/pages/hero-lede.mjs 80`): mann-kendall-trend 120,
   fdr-multiple-testing 119, backup-file-exposure-check 116, email-auth-check 116. Same fix,
   then lower `HERO_LEDE_MAX_WORDS` to 100.
2. **The ADA list's line height is tight** (inherits the page's `.muted` .9rem with 1.5 on `p`
   only). `line-height:1.45` on `.related` would read better; cheap, but measure after.
3. **The ADA page's h1 is 5rem across four lines at 1,280**: 230 px of heading pushing the tool
   below a 900 px fold. A smaller clamp ceiling would do more for that page than its lede ever did.
4. Carried over: the einvoice phone CTA row stacks; the tools topic index cards without ledes;
   the Stories hero's empty right half at 1,280.
