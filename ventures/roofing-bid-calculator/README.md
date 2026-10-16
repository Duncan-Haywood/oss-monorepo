# Roofing Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/roofing-bid-calculator/>

A free browser calculator for residential roofing contractors. It prices a
reroof the way the trade actually bids one — footprint converted to roof
squares by pitch, plus waste, tear-off layers, dump, and loaded labor — and
shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/roofing-bid-calculator -p 8080
# Run the tests
cd ventures/roofing-bid-calculator && node --test
```

After using this, you can now **price a reroof in squares with pitch, waste,
and tear-off visible**, which used to take a spreadsheet that quietly used
house square footage and missed the steep garage.

## The problem it solves

Small roofing crews are told to bid by house square footage or a flat "price
per square" that was copied from the last job. House square footage is the
floor plan. A 1,800 sq ft ranch at 6/12 is about 20.1 squares of roof surface,
not 18. The same house at 12/12 is about 25.5. Add 10% waste and a second
tear-off layer and the covering buy, the dump, and the crew hours have all
moved — two of them in opposite directions. A per-house-foot bid on the wrong
one is a week of work at a loss.

The second thing that sinks these bids is treating a steep section like a
low-slope one. Walking a 12/12 is not the same production rate as a 4/12.
Payroll burden on top of the wage is the third: a $35 crew hour is closer to
$45 once employer taxes, workers' compensation (expensive in this trade), and
insurance are counted.

## How it works

1. **Squares from pitch.** Each section's footprint × √(1 + (rise/12)²) is
   roof surface. Squares = surface ÷ 100.
2. **Waste on the new covering.** Material squares = squares × (1 + waste %).
   Tear-off follows the existing surface × layers, not waste — you do not haul
   off starter strip you have not installed yet.
3. **Steepness.** 7/12–9/12 ×1.25 labor, 10/12–12/12 ×1.5, steeper than 12/12
   ×2. Starting points, not a safety rating.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Other direct cost.** Covering and underlayment per material square,
   accessories as a lump, dump per tear-off square, dumpster, permit, other.
6. **Overhead.** A percentage markup on that direct cost. It is not applied to
   itself or to profit.
7. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price
per roof square, price per house square foot (so they can see how far the
homeowner's unit is from theirs), effective hourly billing rate, the labor
split across sections, and the **walk-away price** — total job cost, below
which the job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal. **Copy share link** puts an
allowlisted hash of the sections, rates, and deposit terms in the page's own
URL, so a partner or the office can open the identical bid — nothing is sent
to a server. See [`share.mjs`](share.mjs) and
[`proposal-terms.mjs`](proposal-terms.mjs).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Material starting points

Covering presets ship with common ballpark material and install-hour figures.
**They are not a supplier quote, a benchmark, or a guarantee.** Real numbers
depend on brand, region, deck condition, and crew. Every rate is editable, and
picking a covering never overwrites a number the contractor has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `roofing-bid-usage` — never the roof, wages, costs, or
prices. A share link encodes only the allowlisted quote fields in the page's
own URL hash; it is never sent to us. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `section_added`, `section_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax or financing handling.
- Residential reroof model. Commercial, new construction takeoffs from a
  drawing, and insurance-supplement workflows are not priced separately yet.
- No hip/valley/ridge takeoff beyond the waste percentage.
- Steepness steps are coarse; a contractor who times their own crew should
  fold that into install hours per square instead.
- "Other section" rows are labelled `Section N` rather than a custom name.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or business advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
