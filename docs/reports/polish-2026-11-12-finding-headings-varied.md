# Polish 2026-11-12: the last finding-heading skips, and a sweep that varies input

**Why.** Item 1 of "still weakest" in `polish-2026-11-12-finding-headings.md`: 8 pages still drew
`.finding h4`, and the one-state clicker in `rendered-headings.mjs` never made them draw a finding, so
nobody knew whether they skipped. Item 2 of the same list: the clicker reaches only one state per page.

**How it was measured.** Full local build (`node platform/pages/build.mjs`, about 17 minutes this
run). The edited pages were patched into `dist/` with the same substitution as the source (a second
full build was not worth 17 minutes for a 2-line change per page); the unpatched copies were kept as
the "before" build. Both were driven in the pre-installed Chromium at 1280 px, third-party requests
blocked.

## What changed

1. **8 pages, h4 → h3.** brand-deal-rate, newsletter-sponsorship-rate, podcast-sponsorship-rate,
   rent-increase-notice, str-cleaning-fee-pricing, turo-host-payout, voiceover-project-rate and
   grant-writer-proposal-price. Script `<h4>` became `<h3>` and the page CSS `.finding h4 {` became
   `.finding h3 {`. All 8 left `KNOWN_H4` in `finding-heading.test.mjs` (40 → 32 entries).
   grant-writer was not on the list; the new sweep found it. Its findings sit after an
   `<h3>Flat fee per proposal</h3>` that is `hidden` when no proposals are entered, so the skip only
   shows in that state.
2. **chiropractor-new-patient-roi-calculator stays h4.** Its findings render after
   `<h3>Funnel and return</h3>`; in the browser it draws a finding by default and shows no skip.
3. **`rendered-headings.mjs` varies input.** After the sample and run clicks, it changes one control at
   a time (each `select` option; `''`, `0`, `1`, `100000` in each number, text, date and textarea
   field), presses the run buttons, records the displayed heading levels, and restores the
   value. It stops at 40 states per page (`--max-states=`). `--no-vary` gives the old behaviour. A page
   that takes over 45 s is reported as failed, not waited on forever. `PROGRESS=1` prints one line per
   page to stderr.

## Numbers

| page | finding reached by | before | after | finding heading computed style (before = after) |
|---|---|---|---|---|
| brand-deal-rate | followers = 0 | 2>4 | none | 15.68 px, 700, margin 0 0 4px, 20 px tall |
| newsletter-sponsorship-rate | subscribers = 0 | 2>4 | none | same |
| podcast-sponsorship-rate | read type = produced | 2>4 | none | same |
| rent-increase-notice | rent roll = "0" | 2>4 | none | same |
| str-cleaning-fee-pricing | nightly = 1 | 2>4 | none | same |
| turo-host-payout | plan = peace of mind | 2>4 | none | same |
| voiceover-project-rate | word count = 0 | 2>4 | none | same |
| grant-writer-proposal-price | (varied sweep) | 2>4 | none | same rule |

`rendered-headings.mjs --slugs=<the 7 listed pages>`: one-state clicker on the before build, 0 of 7 skips
found (it never drew a finding); the varied sweep on the before build, 7 of 7; on the after build, 0.

Full varied sweep of the default set (493 pages, 6 tabs): about 4 minutes, median 31 states a page.
1 skip (grant-writer, fixed above) and 5 pages over the time budget (then 20 s).

`node --test 'platform/pages/*.test.mjs'`: 1562 tests, 1547 pass, 0 fail, 15 skipped.
The 8 ventures' own suites: 28 to 57 tests each, 0 fail.

## Still weakest, and what I would do next

1. **Three pages freeze on a large value.** In a fresh tab, one field set to `100000` blocks the page
   for over 4 s (a timing script, one control at a time): dining-room-table-mix-optimizer (control #2,
   after `areaSqFt=100000` took 934 ms), greenhouse-bench-planner (#4), u-pick-farm-profit-planner (#0).
   A visitor who types an extra zero gets a hung tab. Find the loop each value drives and cap the
   input (a `max` plus a clamp in the calculator) or bound the loop; add a test at the cap. This is a
   product fix, worth a run on its own.
2. **ab-test-significance-calculator and shift-roster-builder** took over 20 s only in the parallel
   sweep (4.6 s and 11.6 s alone). The 45 s budget should cover them; confirm in the next full sweep.
3. Carried over: `--min-a11y=100`, `heading-order.mjs`, `rendered-headings.mjs` and
   `sticky-fit-check.mjs` in the nightly browser checks (control-plane CI, own PR); other mid widths
   (1,000 to 1,100 px) and a shared `input{min-width:0}` (`polish-2026-11-12-mid-width-sideways.md`);
   wall-framing-takeoff TBT.
