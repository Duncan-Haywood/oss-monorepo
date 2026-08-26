# Hot Tub Bid Calculator

A free browser calculator for pool and spa dealers. It prices a
hot-tub install the way the trade actually loses money —
crane access, a new pad, circuit footage, a 60-amp disconnect,
and haul-away as their own hours — and shows the
margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/hot-tub-bid-calculator -p 8080
# Run the tests
cd ventures/hot-tub-bid-calculator && node --test
```

## The problem it solves

Small spa dealers are told to bid by a published "$499 delivery and
setup" special. That rule cannot see the backyard. A compact four-person
tub dropped on an existing patio with a live 50-amp GFCI ten feet
away is not the same job as a large swim spa that needs a crane over
the fence, a new pad, a 60-amp disconnect, and sixty feet of trench.
The trip is the same. The hours are not. Matching a cheaper special
written for the driveway drop is how a sold backyard crane job becomes
a two-day loss after the first stuck disconnect.

Pool-plaster calculators price the water surface, the chip-out, and
the finish. Neither prices a portable spa hang.

After using this, you can now send a spa price that already
includes the crane and the extras, which used to take a guess from a
published setup special.

## How it works

1. **Size, access, and power scope.** A compact driveway drop is not a
   large swim spa and is not a 60-amp disconnect. A crane is not a
   through-gate carry.
2. **The circuit as its own hours.** Circuit footage is billed per
   foot. Zero footage still prices — circuit hours are the disconnect,
   not an error. An existing 50-amp stub does not also bill footage.
3. **Pad, haul-away, cover lift, steps, and gas as their own hours.**
   A brochure special is not a changeout package. Those extras are not
   blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
effective hourly billing rate, the hour split, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a
price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft with
wages omitted, ready to paste into a proposal. Set spa unit cost to
zero if you are pricing delivery and setup only.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, size, access, and power presets ship with common
ballpark hours and material figures. **They are not an industry
standard or an electrical design.** Changing size, access, or
power never overwrites a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `hot-tub-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One spa / one trip. A whole-house electrical upgrade, an in-ground
  spa, or a pool plaster is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price a pool plaster, a walk-in shower, or a water-heater
  swap.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
