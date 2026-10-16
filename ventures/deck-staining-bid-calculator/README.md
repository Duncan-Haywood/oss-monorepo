# Deck Staining Bid Calculator

A free browser calculator for deck-staining contractors. It prices a
stain or seal the way the trade actually loses money — stainable
surface from picket rails and stairs, strip versus wash, oil two-coat
versus water, and second-story carry as their own hours — and shows
the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/deck-staining-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/deck-staining-bid-calculator -p 8080
# Run the tests
cd ventures/deck-staining-bid-calculator && node --test
```

## The problem it solves

Small staining crews are told to bid by a published "$2.50 / sq ft"
special. That rule cannot see the rails. A 200-square-foot platform
with no rail is not the same job as a 192-square-foot 12x16 with 40
lineal feet of picket rail and a stair. The trip is the same. The
stainable surface is not. Matching a cheaper special written for the
platform is how a sold oil two-coat picket job becomes a two-day
loss after the first stair.

Deck-build calculators price posts and joists. Exterior house
painting prices elevations. Neither prices a stain.

After using this, you can now send a stain price that already
includes the rails and the extras, which used to take a guess from a
published per-square-foot special.

## How it works

1. **Prep, finish, and access.** Washing a ground-level platform is
   not stripping a second-story oil job, and is not a composite
   clean-and-seal.
2. **The stainable surface as its own hours.** Stainable square feet
   = walking square feet + rail lineal feet × stainable sf per foot +
   stairs. Prep hours and coat hours scale with that surface. Zero
   walking feet still prices — stain hours are the surface, not an
   error. A ground-level wash does not also bill furniture.
3. **Rails, stairs, strip, and occupancy as their own hours.** A
   platform special is not a picket-rail package. Those extras are
   not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
effective hourly billing rate, price per walking square foot, the
hour split, and the **walk-away price** — total cost, below which
the job makes nothing. Entering a price already on the table scores
it against the same cost base. **Copy bid summary** turns the result
into a plain-text draft with wages omitted, ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, prep, finish, and access presets ship with common ballpark
hours and material figures. **They are not an industry standard or a
coating warranty.** Changing prep, finish, or access never overwrites
a rate the shop has already changed. Picket rail defaults to 9
stainable square feet per lineal foot (both sides of the pickets
plus the rails).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `deck-staining-bid-usage` — never the address,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One deck / one trip. A new deck build, an exterior house paint job,
  or a hardwood-floor refinish is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price a deck build, exterior house painting, or hardwood
  refinishing.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
