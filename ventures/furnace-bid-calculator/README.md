# Furnace / Heat Pump Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/furnace-bid-calculator/>

A free browser calculator for HVAC shops. It prices a furnace or heat-pump
replacement the way the trade actually loses money — extra duct past the
included run, attic versus basement, a matching coil, a gas upsize,
haul-away of the old unit, and a thermostat as their own hours — and
shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/furnace-bid-calculator -p 8080
# Run the tests
cd ventures/furnace-bid-calculator && node --test
```

## The problem it solves

Small HVAC shops are told to bid by a published "$2,495 installed"
furnace special, or by a coupon-site changeout price. That rule cannot
see the house extras. A 60k 80% AFUE basement swap with fifteen
included feet of duct is not the same job as a 100k 96% condensing
unit in an attic with a matching coil, a gas upsize, forty feet of
duct, haul-away of the old unit, and a new thermostat. The trip is the
same. The hours are not. Matching a cheaper special written for the
brochure basement swap is how a sold attic-and-coil job becomes a
two-day loss after the first condensate run.

HVAC-maintenance calculators price a recurring service contract.
Mini-split calculators price ductless heads and a line-set.
Water-heater calculators price a vent, a gas upsize, and an attic for
a water heater. None of those price a furnace or heat-pump changeout.

After using this, you can now send a furnace price that already
includes extra duct, attic hours, a matching coil, and haul-away,
which used to take a guess from a published special.

## How it works

1. **Capacity and equipment.** A 60k 80% AFUE swap is not a 100k 96%
   condensing unit and is not a heat-pump changeout.
2. **Footage past the included run.** The special includes a stated
   number of duct feet. Everything past that is billed as its own
   hours. A shorter run than the included footage still prices — extra
   footage is zero, not an error.
3. **Attic versus basement as their own hours.** An open-utility
   basement set is not an attic condensate run. Coil, gas upsize,
   haul-away, and a thermostat are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price
per foot of duct, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, capacity, equipment, and location presets ship with common
ballpark hours and material figures. **They are not an industry
standard, a Manual J, or an HVAC design.** Changing capacity,
equipment, or location never overwrites a rate the shop has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `furnace-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One unit / one trip. A dual-fuel package, a full duct redesign, or a
  commercial rooftop is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not HVAC, construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
