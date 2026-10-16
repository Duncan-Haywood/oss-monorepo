# Pool Plaster / Resurfacing Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pool-plaster-bid-calculator/>

A free browser calculator for pool plaster and resurfacing contractors. It
prices a drain-and-replaster the way the trade actually loses money — floor
plus walls (not the homeowner's length × width), finish, chip-out, spa,
steps, waterline tile, and coping as their own hours — and shows the
margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/pool-plaster-bid-calculator -p 8080
# Run the tests
cd ventures/pool-plaster-bid-calculator && node --test
```

## The problem it solves

Small plastering shops are told to bid by a published pool-plaster price,
or by dollars per square foot. That rule usually uses the water surface:
length × width. A 16×32 rectangle with a 3.5-foot shallow end and an
8-foot deep end is 512 square feet of water and about 1,064 square feet
of plaster. A white-plaster overlay with no chip-out is not the same job
as a pebble finish with a full chip-out to gunite, a spa, waterline tile,
and coping. The pool is still "a 16×32." The hours are not. Matching a
cheaper water-surface quote written for the brochure overlay is how a
sold pebble job becomes a two-day loss after the first drain day.

Pool-route calculators price a weekly chemical stop. Concrete calculators
price a slab. Epoxy calculators price a garage floor. Walk-in shower
calculators price tile. None of those price a pool replaster.

After using this, you can now send a plaster price that already includes
the walls, the finish, the chip-out, and the tile band, which used to
take a guess from a published per-square-foot number written for the
water surface.

## How it works

1. **Floor plus walls.** A rectangle's plaster surface is length × width
   plus 2 × (length + width) × average depth. A freeform uses the water
   surface times a wall multiplier. The homeowner's length × width is
   only the floor.
2. **Finish and chip-out as their own hours.** White plaster, quartz,
   pebble, and glass carry different material and plaster hours. A
   drain-and-overlay keeps chip-out at zero. A full chip-out bills the
   whole plaster takeoff.
3. **Spa, tile, and coping extras.** A spa, steps, waterline tile, and
   coping are billed as their own hours and kits. They do not scale with
   the water surface.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a plasterer sanity-checks a bid against:
price per square foot of plaster, price per square foot of water surface
(the number the homeowner is shopping), effective hourly billing rate,
the hour split, and the **walk-away price** — total cost, below which the
job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, finish, and chip-out presets ship with common ballpark hours and
material figures. **They are not an industry standard, a pool
specification, or a structural determination.** Changing finish or
chip-out never overwrites a rate the plasterer has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `pool-plaster-bid-usage` — never the pool, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the plasterer enters their own numbers.
- One shell / one finish. A commercial aquatic center, a vanishing-edge
  trough, or a full remodel with new tile mosaic is not priced as a package.
- Water refill uses gallons × a per-gallon rate; municipal fees and fill
  time are the plasterer's choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, engineering, pool,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
