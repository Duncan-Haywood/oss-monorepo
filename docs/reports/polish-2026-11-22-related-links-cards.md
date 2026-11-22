---
kind: polish
topics: [design, seo]
date: 2026-11-22
---
# Polish 2026-11-22: guide-link stacks moved to related-links cards on 18 pages; three fold fixes

Picked item 2 and item 3 of `polish-2026-11-22-lede-crosslinks.md` (s-corp hint;
bank-statement-pdf-to-csv and patreon-fee-calculator by depth). Item 3 of
`polish-2026-11-22-header-crosslinks.md` (a shared `related-links` style) was looked at and
not done: see "Still weakest" item 3.

## What changed

1. **s-corp-reasonable-compensation-calculator**: the "Your numbers" card's 6-line note on
   "compensation pool" and the comparable-wage figure moved from above the form to just under
   the first row of fields (`p.privacy.field-note#field-note`), and both inputs it explains
   got `aria-describedby="field-note"`. Word for word.
2. **bank-statement-pdf-to-csv**: the first card's note moved below the file picker
   (`p.note.file-note#file-note`, `aria-describedby`), the journal-file-note pattern. The
   header's long testing note is an honesty note and stays visible.
3. **patreon-fee-calculator**: its two pointer `p.lede` paragraphs (own guides, churn
   analyzer) moved into a `section.related-links` card before "Common questions" as `p.privacy`.
4. **18 more pages** with 3 to 5 link paragraphs in the header (any class: `seo-link`,
   `tagline`, `docs`, `fine`, `note`, bare `p`; links to `../slug/` or own `*.html`):
   every such paragraph moved word for word, class kept, into a "Related guides and tools"
   section just before the FAQ. It takes `card` when the FAQ section is a `.card`, else
   matches the FAQ container. Paragraphs with "Nothing is uploaded"/"never leaves" and the
   `data-answer-lead` paragraph are not moved. Pages: sign-language-interpreter, voiceover,
   employee-cost, facebook-marketplace, grant-deadline-tracker, no-show, 3d-print,
   chimney-sweep, dental-ppo-writeoff, depreciation-recapture, fleet-repair-or-replace,
   mobile-detailing, parcel-dim-weight, pet-grooming, shop-rate, staffing-markup,
   str-occupancy-tax, tree-service.
5. **Check**: `header-crosslinks.test.mjs` gains `headerLinkParagraphs` (any class, own guides
   included) with `MAX_HEADER_LINK_PARAGRAPHS = 2`. It failed on main with 18 pages; passes now.
   Pages at exactly 2 (babysitting-business-kit, depop, grailed, kdp, kickstarter, tcgplayer,
   water-heater, ...) were left: mostly one-line links.
6. **Ratchet**: `venture-fold-baseline.json`: 11 keys removed (now on screen), 3 tightened
   (bank-statement 1395 → 1166, patreon 1365 → 1033, s-corp 1152 → 960).
   `DIST=<after> venture-fold.mjs --check --slugs <21>` passes.

## Measured (`venture-fold.mjs`, Chromium, `--only` previews of main at c154dab13 and this branch)

| Screen | first field on screen | median field top |
|---|---:|---:|
| 360 wide | 5 → 17 of 21 | 997 → 727 px |
| 390×844 | 7 → 18 of 21 | 919 → 707 px |
| 1280 wide | 20 → 21 of 21 | 645 → 500 px |

| page | 360 | 390 | 1280 |
|---|---:|---:|---:|
| 3d-print-price-calculator | 960 → 801 | 909 → 750 | 637 → 538 |
| bank-statement-pdf-to-csv | 1,508 → 1,237 | 1,395 → 1,166 | 672 → 592 |
| chimney-sweep-bid-calculator | 870 → 726 | 807 → 707 | 668 → 568 |
| dental-ppo-writeoff-calculator | 1,002 → 804 | 919 → 722 | 659 → 526 |
| depreciation-recapture-calculator | 1,020 → 766 | 953 → 720 | 599 → 472 |
| employee-cost-calculator | 1,056 → 719 | 950 → 656 | 676 → 511 |
| facebook-marketplace-fee-calculator | 816 → 676 | 785 → 645 | 623 → 526 |
| fleet-repair-or-replace-planner | 1,204 → 851 | 1,081 → 792 | 636 → 495 |
| grant-deadline-tracker | 763 → 511 | 722 → 487 | 554 → 405 |
| mobile-detailing-bid-calculator | 649 → 551 | 649 → 551 | 568 → 470 |
| no-show-fee-calculator | 1,101 → 669 | 1,053 → 645 | 657 → 441 |
| parcel-dim-weight-calculator | 776 → 584 | 734 → 542 | 620 → 500 |
| patreon-fee-calculator | 1,414 → 1,083 | 1,365 → 1,033 | 904 → 707 |
| pet-grooming-bid-calculator | 622 → 551 | 601 → 530 | 521 → 450 |
| s-corp-reasonable-compensation-calculator | 1,254 → 1,040 | 1,152 → 960 | 716 → 632 |
| shop-rate-calculator | 980 → 718 | 884 → 643 | 640 → 486 |
| sign-language-interpreter-rate-calculator | 1,116 → 741 | 1,095 → 720 | 680 → 476 |
| staffing-markup-calculator | 987 → 704 | 901 → 660 | 645 → 491 |
| str-occupancy-tax-calculator | 997 → 767 | 932 → 724 | 630 → 508 |
| tree-service-bid-calculator | 832 → 735 | 808 → 711 | 677 → 580 |
| voiceover-project-rate-calculator | 1,123 → 727 | 1,077 → 702 | 670 → 466 |

No page scrolls sideways at any width. Screenshots (390×844, 1x):
`img/polish-related-links-{before,after}-{no,sign}-390.png`.
Tests: each changed venture's own suites pass (`node --test` per file); `header-crosslinks.test.mjs` 5/5.

## Still weakest, and what I would do next

1. **bank-statement-pdf-to-csv (1,166 at 390)**: the header's testing note is ~110 words. It is
   an honesty note; a shorter version that keeps every claim (tested on generated statements
   and a public benchmark; no real customer statement; use the balance check) would land it.
   Do not hide it in a `<details>`.
2. **patreon-fee-calculator (1,033)**: answer lead (keep) plus an 80-word lede and a 4-row
   "Plan" fieldset with a 50-word note before the pledge fields. The lede could lose its last
   sentence ("This free calculator finds ...") which the h1 already says.
3. **Shared `related-links` style**: not done. The 21 cards now reuse each page's own section and
   paragraph styles, which read well in screenshots on three palettes (employee-cost,
   grant-deadline, tree-service). A site-wide rule would fight 26 different venture palettes;
   only worth it if a page's card looks broken.
4. **grant-deadline-tracker's card has no `.card` frame** because its FAQ is a bare `h2` in
   main. Reads fine; wrap both in cards if that page gets a visual pass.
5. Carried over: `--check` in CI (control plane, own PR; `polish-2026-11-21-venture-fold-baseline.md` item 2);
   a full `--write-baseline` on the next full build (`polish-2026-11-22-lede-crosslinks.md` item 4).
