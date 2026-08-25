# Walk-In Shower Bid Calculator

A free browser calculator for tile and bathroom contractors. It prices a
tiled walk-in shower or tub-to-shower conversion the way the trade actually
loses money — wall and floor tile, then the drain, the slope, the niches,
the bench, and the glass as their own hours — and shows the margin before
the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/walk-in-shower-bid-calculator -p 8080
# Run the tests
cd ventures/walk-in-shower-bid-calculator && node --test
```

## The problem it solves

Small tile shops are told to bid by price per square foot of tile. That
rule cannot see the wet-area extras. A 5x3 alcove tub-to-shower that keeps
the existing valve and a framed door is not the same job as a 5x5 curbless
walk-in with a linear drain, a valve relocate, two niches, a masonry bench,
and frameless glass. The tile counts are close. The hours are not. Matching
a cheaper per-SF quote written for the brochure alcove is how a sold
walk-in becomes a week-long loss after the first curbless floor.

Flooring calculators price LVP, hardwood, and *floor* tile. Cabinet and
countertop calculators price kitchens. Drywall prices hang-and-finish. None
of those price a wet-area system.

## How it works

1. **Tile and waterproofing.** Wall and floor square footage, plus waste on
   the billed tile and waterproofing on the same wet area.
2. **Wet-area extras as their own hours.** Tub tear-out, valve relocate,
   linear drain, and curbless slope do not scale with tile SF.
3. **Finish extras.** Niches, a floating or masonry bench, glass, and an
   optional steam unit.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price
per square foot of tile, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft with wages
omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, bench, and glass presets ship with common ballpark hours and
material figures. **They are not an industry standard, a waterproofing
warranty, or a building-code determination.** Picking a bench or glass type
never overwrites a rate the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `walk-in-shower-bid-usage` — never the bathroom,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One wet-area system. A whole-bath remodel (vanity, flooring outside the
  shower, paint) is not priced as a package.
- Waterproofing is one rate for the wet area; sheet versus liquid is the
  contractor's choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, waterproofing,
construction, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
