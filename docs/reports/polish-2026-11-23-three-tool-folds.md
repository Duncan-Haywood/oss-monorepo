---
kind: polish
topics: [design, fold]
date: 2026-11-23
---
# Polish: three tool pages bring their first field 53 to 263 px higher on a phone (2026-11-23)

Picked item 1 and item 2 of "Still weakest" in `polish-2026-11-22-related-links-cards.md`, and
item 1 of "Still weakest" in `polish-2026-11-22-lede-crosslinks.md`.

## What changed

- **bank-statement-pdf-to-csv**: the header's testing note went from ~150 words to ~70. Every
  claim stays on the page: the short note keeps "tested on generated statements and public
  benchmark PDFs; none is a real customer's statement; use the balance check" and links to a new
  "Tested on" item (`#tested-on`) at the top of "The model, and what it leaves out", which carries
  the full benchmark detail word for word and the OCR-correction rule. Not hidden in a
  `<details>`. The intro paragraph was tightened too (same claims; "text-based" dropped because
  scans are read by OCR now).
- **patreon-fee-calculator**: the lede's first sentence (the two fees, which the answer lead
  states with its source) and last sentence (what the h1 already says) are gone; the
  per-creation warning stays. The Plan note under the select is 30 words instead of 50.
- **1099-k-threshold-checker**: the intro is one shorter sentence plus "Private: nothing leaves
  your browser." The answer lead is untouched (AEO).
- `venture-fold-baseline.json`: the three entries lowered to the new numbers.

## Measured (`--only` preview builds of main and of this branch, `venture-fold.mjs --json`)

| width | page | first card top | first field top |
|---|---|---|---|
| 390 | bank-statement-pdf-to-csv | 1058 → 795 | 1159 → 896 |
| 390 | patreon-fee-calculator | (none) | 1026 → 838 |
| 390 | 1099-k-threshold-checker | 835 → 783 | 951 → 898 |
| 360 | bank-statement-pdf-to-csv | 1129 → 841 | 1230 → 942 |
| 360 | patreon-fee-calculator | (none) | 1076 → 861 |
| 360 | 1099-k-threshold-checker | 911 → 832 | 1026 → 947 |
| 1280 | all three | median 524 → 479 | median 651 → 625 |

No sideways scroll at any width. At 390 the first card is now on screen for bank-statement
(795 ≤ 828) and the card heading or "Plan tier" label shows on all three; the fields themselves
still sit 10 to 70 px under the 828 px line, so all three stay in the baseline at lower numbers.
Screenshots at 390 checked by eye. Tests: each venture's `page.test.mjs` (10, 25, 14 pass) and
`platform/pages/{answer-lead,venture-fold,hero-fold}.test.mjs` (71 pass).

## Not done

- `polish-2026-11-22-lede-crosslinks.md` item 2 (**s-corp**) is stale as written: in
  `s-corp-reasonable-compensation-calculator` the "compensation pool" note already sits *after*
  the first row of inputs, not before. What holds that page at 960 is the intro (55 words) plus
  the "After using this, you can now" value paragraph (55 words). Left alone.

## Still weakest, and what I would do next

1. **The "After using this, you can now" value paragraph** sits in the header of many venture
   pages (1099-k, s-corp, and others) between the intro and the tool. Count how many baseline
   pages carry one; if it is most of them, moving it below the first card (one shared change in
   the venture template or a build-time move) could clear dozens of baseline entries at once.
2. **patreon-fee-calculator's answer lead** says "confirmed by web search because the help centre
   was not fetchable from this build": process detail a reader doesn't need. Re-fetch the
   Patreon help page and cite it directly, which also shortens the lead (field 838 → under 828).
3. Carried over: a full `--write-baseline` on the next full build (`polish-2026-11-23-phone-band-rhythm.md` item 2).
