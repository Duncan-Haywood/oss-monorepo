---
kind: polish
date: 2026-11-14
---
# Polish 2026-11-14: economic-nexus tracker intro to a jump row

Picked from `polish-2026-11-14-lead-length.md`, "Still weakest" item 1. No open PR touched
the page (searched `polish in:title`, `nexus in:title`).

## What was wrong

Between the answer lead and the first control sat three paragraphs: a 60-word intro that
re-explained economic nexus (the lead and the first FAQ already do), an "After using this,
you can now" paragraph carrying the three guide links in a sentence, and a 1099-K aside.
Inside the import card, a 50-word method paragraph came before the file input. The card was
titled "Or import your orders" although it is the first way in, and the manual form below it
was titled "Add a state".

## What changed (`ventures/economic-nexus-threshold-tracker/index.html`)

- Intro cut to two sentences (what it does, confirm the state's wording).
- The value paragraph and the 1099-K aside became one shared `pf-jump` row
  (`platform/pages/jump-row.mjs`): **Import orders (CSV)** (filled), Add a state by hand,
  Why the rule differs by state, vs paid nexus monitoring, vs a spreadsheet, Form 1099-K is
  a separate threshold. Colours come from the page's own tokens; `--jump-on` is left at its
  white default (my first draft set it to the ink colour, which would have been ink on ink).
- Import card: titled "Import your orders (CSV)"; one sentence (sources, never uploaded)
  above the input; the column-finding and projection method moved into the note under it.
  Nothing was deleted from the method text.
- Manual card: `id="add-state"`, titled "Or add a state by hand".
- Unused `.value` CSS removed.
- `page.test.mjs`: a test that every jump-row link resolves (an `id` on the page, or a file
  in the repo).

## Numbers

Chromium on the built `dist/`, 844 px tall, reduced motion, third-party requests blocked,
300 ms after load. "After" is the same `dist/` with the source edits spliced into the built page.

| width | first input y | `#import-card` y | manual form y | sideways scroll |
|---|---|---|---|---|
| 320 | 2,122 → **1,472** | 1,749 → 1,251 | 2,845 → 2,352 | 0 → 0 |
| 390 | 1,712 → **1,167** | 1,431 → 995 | 2,327 → 1,890 | 0 → 0 |
| 1,280 | 1,009 → **737** | 836 → 608 | 1,408 → 1,158 | 0 → 0 |

At 1,280 the file input is now inside the first screen. Pills are the shared 34 px target with
the 3 px focus ring. No new request, no script.

Screenshots: [390 before](img/polish-2026-11-14-nexus-intro-before-390.png) ·
[390 after, the new row](img/polish-2026-11-14-nexus-intro-jump-390.png) ·
[1,280 after](img/polish-2026-11-14-nexus-intro-after-1280.png).

## Still weakest, and what I would do next

1. **The lead itself is the tallest block on a phone** (about 700 px at 390). It is
   under the 100-word cap, but it lists five no-tax states and two $250k states; those
   are in the per-state table already. Trimming to the $100k/$500k rule + transactions +
   source + date would pull the file input near 900 px.
2. **The h1 at 320 to 390 px** is `clamp(2rem, 5.5vw, 3.6rem)` in Georgia, three lines.
   Fine, but a shorter h1 ("Which states' sales tax thresholds have you crossed?") would not
   help much; leave it.
3. Carried over: lower the lead cap to 90 words; llms.txt line 9 of this product still
   has the older lead; leads missing on about 26 high-intent tools; appointment-deposit
   (1,613) and quarterly-estimated-tax-calendar (1,460) first-input depths.
