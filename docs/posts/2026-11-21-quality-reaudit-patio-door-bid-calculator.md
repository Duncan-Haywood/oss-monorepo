---
title: "Re-audit: the patio-door bid calculator's fix closed one high defect and left four, all fixed today"
seo_title: "Why a blank box in a door bid calculator should never price as zero"
date: 2026-11-21
tags: [quality-audit, evaluation, testing, construction]
description: "PR #17050 fixed the frozen price on return visits, but a blank wage still priced a door with $0 labor and the sill pan was counted twice."
---

The [patio-door bid calculator](https://marisstella.app/patio-door-bid-calculator/) prices a sliding or
multi-panel door replacement from the panels, frame, glass, install method and access, then adds
loaded labor, overhead and a margin taken as a share of price. The
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-patio-door-bid-calculator.json) found nine
defects and scored every dimension 2. One fix PR (#17050) followed. Today's
[re-audit](../../portfolio/quality/audits/2026-11-21-patio-door-bid-calculator.json) went back over all
nine against the code on `main`.

**Verdict: still below the bar at the start of the session** (correctness, claims and verification
each 2). The scores describe the code before today's fixes. A later round re-scores it.

## What the earlier fix closed

- **The frozen price.** Before #17050, the page treated every field it restored from a saved bid as
  hand-typed. So on any visit after the first, changing a 6-ft vinyl door to a 16-ft 4-panel impact
  unit left the price at $2,770.12. Now only fields that differ from their preset are kept. On a saved
  default form, changing the configuration moves the price again.
- **The comparison table** now labels its column "Bid at a 32% margin" and gives the gap to the bid
  ("Under the bid by $970.12"), not a loss against the walk-away.

## What it left

1. **A blank box priced as zero.** `Number('')` is 0 in JavaScript. A browser number box also turns
   `1,200` into an empty value. With the crew wage cleared, the default job priced at $1,859.41 with
   $0 labor. With the unit cost cleared, it priced at $857.77 with no door. Neither showed an error.
2. **No test guarded the restore fix.** Forcing every restored field back to "hand-typed" (the
   exact 11-17 defect) passed all 144 tests.
3. **The sill pan counted twice.** The new-construction wrap hours were described as covering "flashing, sill
   pan and exterior wrap", and the new-construction presets also add the separate sill-pan line
   (1.5 h, $165). In a new-construction install the installer fits one pan before setting the unit
   and flashing it into the house wrap, so it is one task.
4. **The comparison prose** still said the tool "returns a walk-away price" when it meant the marked-up
   bid. The tool's own walk-away is total cost.

Smaller items: hours are crew-hours at one wage and the page never said so, and the "effective hourly
rate" divides the whole price, door included, by the hours. The README also named 4 of the 7 events
the page counts.

## The numbers that do hold

Three bids recomputed by hand matched the engine to the cent:

| job | hours | cost (walk-away) | bid |
|---|---|---|---|
| 6-ft vinyl 2-panel retrofit, ground, tear-out (page defaults) | 7.4 | $1,883.68 | $2,770.12 |
| 16-ft 4-panel fiberglass, impact, new-con, balcony, transom, trim, sill pan, tear-out | 30.41 | $15,492.02 | $22,782.38 |
| 8-ft wood-clad triple, new-con, sill pan, $52 wage, 28% burden, 12% OH, 30% margin, $85 permit | 13.68 | $6,946.61 | $9,923.72 |

## Fixed today (PR #18138)

- A blank field is now an error ("Hourly wage is blank: enter a number (0 if it does not apply)").
  An omitted field in an API call still takes its default.
- The wrap hours are now defined as the tear-back, the flashing tape and the house-wrap tie-in, with
  the sill pan as its own line. The same wording is in the engine, the page FAQ and its structured
  data, and the guide. The prices do not change.
- The page says hours are crew-hours at one wage. The rate line reads "Price per crew-hour (door and
  materials included)".
- The comparison page names the bid and the walk-away separately. The README lists all seven events.
- New tests: a blank-field test across five fields, and a page test that now catches the seeded
  restore mutant.

Still open, in the README's known gaps: a lead and a helper paid different wages need a blended
wage, the page's preset logic is not driven in a browser DOM, and the money formatter exists twice.

*The calculator is free and MIT licensed. Its prices are estimates from the rates you type, not
construction, legal or financial advice.*
