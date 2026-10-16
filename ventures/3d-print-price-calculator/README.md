# 3D Print Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/3d-print-price-calculator/>

Makers selling 3D-printed parts on Etsy, Shopify, or at a craft table can use
this free browser-local calculator to price one print — from filament,
electricity, printer depreciation, and a realistic failed-print rate, through
post-processing labor and packaging — and solve directly for a selling price
that clears the marketplace's fee and still lands on a target margin.
**After using this, you can price a print from what it actually costs to make
and sell, instead of a rule of thumb like "3x the filament cost" that quietly
skips electricity, machine wear, failed attempts, and the marketplace's own
cut.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why "3x filament cost" undercharges

Filament is usually the smallest line item once you count what a print
actually spends:

- **Electricity and printer wear are real costs with no receipt to remind
  you of them.** A multi-hour print draws power the whole time, and every
  hour of printing is an hour closer to the printer's replacement — the
  calculator amortizes the printer's cost over its expected lifetime hours
  and charges each print its share.
- **A failed print still spent filament, electricity, and machine time
  before it was scrapped.** On average, 1/(1 − failure rate) attempts are
  needed to land one sellable part, so the calculator inflates only the
  per-attempt costs (material, electricity, machine wear) by that factor —
  post-processing and packaging only ever touch the part that actually
  sells.
- **The marketplace fee is a percentage of the price you charge, not a cost
  you can add like the others.** Solving `price×(1 − fee%) − cost =
  price×(margin%)` for price directly is what makes the suggested number
  already clear the fee at your target margin, instead of a price that looks
  right until the marketplace takes its cut.

**Import from your slicer.** Choose a sliced `.gcode` file and the page reads the
filament weight and print time from the slicer's own summary comments
(PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, Simplify3D) — in the browser, the file is
never uploaded. Cura reports length rather than weight, so grams are derived
from 1.75 mm filament at 1.24 g/cm³ (PLA) and the page says so. See `gcode.mjs`.

The "check a price you're actually charging" panel recomputes the real
profit and margin for a price you already picked — matching a competitor's
listing, say — against the same break-even, the same way this portfolio's
other pricing calculators let you check a real number against the estimate.

## Privacy and usage

Everything runs in your browser. Your costs and prices are never uploaded,
there is no account, and nothing is saved when you close the tab — every
field resets on refresh by design. We count anonymous local feature events
only (`price-calculated`, `price-checked`, `gcode_imported`), with a visible opt-out. Do Not
Track and Global Privacy Control disable counting automatically. No costs or
prices are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, measure your printer's actual power draw, predict
actual failure rates, or replace your own pricing judgment, accountant, or
marketplace's fee schedule.

MIT licensed. See `LICENSE`.
