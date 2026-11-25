# Rebar Schedule: bar bending schedule calculator and cutting optimizer

A free browser tool and CLI for site engineers, rebar detailers, fixers and
small contractors: **paste a bar bending schedule and get every cut length,
the weight per mark and per bar size, and a cutting plan from stock bars that
buys the least steel**, with a proven bound on how close to optimal it is.

**Live tool:** https://marisstella.app/rebar-schedule/ ·
**Guide:** [How to calculate a bar bending schedule](https://marisstella.app/rebar-schedule/how-to-calculate-bar-bending-schedule.html)

After using this, you can **order the right tonnage per bar size and cut it
with less waste than cutting longest-first by hand**, and check a schedule
someone else sent you before the steel is cut.

## Who it is for

| Today's option | What it does | What this does better |
|---|---|---|
| Rebar detailing software (RebarCAD, aSa and similar) | Draws and schedules bars from the model, drives bending machines; paid seats | Free, one page, reads the schedule you already have; for checking, weighing and cutting, not detailing |
| Spreadsheet BBS templates | Cut length and weight per row | Same, plus the bend radius per size, an exact geometric check of each formula, and an optimal cutting plan |
| Cutting by hand on site (longest piece first) | Works, wastes steel | Column-generation plan with a lower bound: proven optimal in 197 of 200 generated schedules |

Path to revenue (payment rails off): free tool and lead magnet for the
construction set (`wall-framing-takeoff`, `concrete-bid-calculator`). A paid
path would be a branded cutting-sheet PDF and a shop mode that keeps an offcut
rack between jobs, both needing a real fabricator's input first.

## What it does

- **Reads** a schedule as CSV, tab-separated (cells pasted from a
  spreadsheet) or semicolon-separated text. A header row is read by name
  (mark, dia/size, shape, members, each, A..E, R); without one the columns are
  mark, size, shape, members, each, A, B, C, D, E. Sizes as `12`, `H12`, `T12`
  or `B500B 12`.
- **Cut length** per bar from the shape code (`shapes.mjs`): 00 straight,
  11 L-bar, 21 U-bar, 51 closed link with hooks, and `R`, any bar with only
  90-degree bends, from the exact centreline geometry. Minimum scheduling
  radius by size (2d to 16 mm, 3.5d from 20 mm, the BS 8666 table), or an `R`
  column to override it. Rounded up to 25 mm by default.
- **Weight**: pi d^2/4 x 7850 kg/m3 per metre, per mark, per size, in total.
- **Cutting plan** per bar size (`stock.mjs`) from one or more stock lengths,
  with an optional loss per cut:
  1. The cutting-stock LP (Gilmore and Gomory) by column generation: a
     revised simplex over the patterns found so far, and a bounded-knapsack
     dynamic programme on the lengths' common divisor that prices the best new
     pattern for each stock length. It stops only when no pattern has negative
     reduced cost, so the LP value is a proven lower bound.
  2. Whole-bar plans built five ways (LP rounded down then best-fill; LP
     rounded up with surplus pieces dropped; diving, which fixes the LP's
     most-used pattern and re-solves on what is left; best-fill alone;
     first-fit decreasing). The cheapest is kept.
  3. With one stock length the bound is rounded up to whole bars; a plan that
     meets it is marked proven optimal, otherwise the gap is shown.
- **Offcuts** at or over a length you choose are listed as worth racking.
- CSV export of the schedule and of the cutting plan (cells a spreadsheet
  would run as formulas are quoted).

CLI: `node cli.mjs schedule.csv --stock 12000,6000 --round 25 --kerf 0`, or
`--example`, or `--csv`.

## How it is checked

**Spec sources.** The professional who would sign this off is the
reinforcement detailer or the engineer checking the schedule. Rules: BS 8666
(scheduling, dimensioning, bending and cutting of steel reinforcement) for the
minimum scheduling radii and the total-length formulas of shapes 00, 11, 21
and 51, taken as printed on UK fabricators' BS 8666 shape-code charts (the
standard itself is paywalled and was not read; the radii were cross-checked
against two published copies of the radius table); BS 4449 mass table for
kg/m; Gilmore and Gomory (1961) for the cutting-stock method.

- `shapes.test.mjs`: the radius table as published (12, 16, 20, 24, 32, 70,
  87, 112, 140, 175 mm); mass per metre within 0.001 kg/m of the BS 4449 table
  (0.222 ... 15.413); one 90-degree bend from first principles by hand; the
  chart formulas for 11 and 21 against the exact bend geometry at every
  standard size (within 0.1d per bend); hand-worked 11, 21, 51 and a 25 mm bar
  with the 3.5d radius.
- `stock.test.mjs`: the bounded knapsack against brute force on 40 cases; the
  plan against an exhaustive branch-and-bound on **150 random small
  schedules: optimal in all 150**, the bound never above the optimum, every
  piece cut exactly once, every pattern within its bar; the LP optimum
  certified by duality (every pattern of a 4-length case enumerated, none
  prices out, dual value equals primal value); kerf counted between cuts only;
  two stock lengths.
- `schedule.test.mjs`: reading headers in any order and positional rows, bad
  rows named, weights by hand, the example (32 bars of 12 mm where
  first-fit decreasing takes 34, proven), too-long bars reported per size, the
  CSV formula guard.
- `check/benchmark.mjs` (output in `check/BENCHMARK.txt`): 200 generated
  schedules for one size from 12 m stock, 4 to 25 lengths of 600 to 11,000 mm,
  2 to 60 of each. Proven optimal in **197 of 200**, at most one bar over the
  bound in the other three. First-fit decreasing bought more bars in **122 of
  200**, about **1.0% more steel** (waste 6.4% of steel bought against 5.4%).
  Generated schedules, not real jobs. Slowest schedule about 0.25 s.
- `page.test.mjs`: page wiring, no markup from results, the clauses, the
  sitemap, and that the numbers on the pages are the ones the scripts print.

## Limits

- Only shapes 00, 11, 21, 51 and 90-degree shapes. Other BS 8666 codes,
  ACI 315 hooks and US bar sizes are not modelled.
- Minimum radii only; a specification calling for larger radii needs the R
  column.
- No laps or couplers: a cut length over the longest stock bar is refused
  with that advice.
- The offcut rack is not carried between jobs, and offcuts are not used as
  stock.
- Not checked against a real fabricator's cutting sheet.

## Next

A real schedule from a detailer to read, and a fabricator's cutting sheet to
compare against; existing offcuts as stock (the LP takes several stock lengths
already); US bar sizes with ACI 318 bend diameters; more shape codes, each
pinned by the geometry test.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering or detailing advice, and it
does not replace a qualified professional or the engineer of record. **You are
responsible for reviewing and verifying its output before relying on it**,
including before ordering or cutting steel. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Privacy

Everything runs in your browser. Your schedule is never uploaded, and there are
no accounts, tracking cookies or analytics vendor. An anonymous counter in the
browser's local storage (`rebar-schedule-usage`) records which features were
used and the day; the checkbox in the footer turns it off.

## Licence

FSL-1.1-MIT, see `LICENSE`.
