# Fireplace Insert Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fireplace-insert-bid-calculator/>

A free browser calculator for hearth and chimney shops. It prices a
fireplace-insert install the way the trade actually loses money —
liner footage, a new hearth, a gas run, a dedicated circuit, a
surround, and a two-story stack as their own hours — and shows the
margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/fireplace-insert-bid-calculator -p 8080
# Run the tests
cd ventures/fireplace-insert-bid-calculator && node --test
```

## The problem it solves

Small hearth shops are told to bid by a published "$2,499 installed"
gas-insert special. That rule cannot see the fireplace. A small gas
cassette in an existing masonry firebox with a live stub, no liner,
and a one-story stack is not the same job as a large wood insert with
a 30-foot stainless liner, a new hearth pad, a surround, and a
two-story chimney. The trip is the same. The hours are not. Matching a
cheaper special written for the brochure gas hang is how a sold
wood-and-liner job becomes a two-day loss after the first seized
damper.

Chimney-sweep calculators price the flue, creosote, and CSIA height.
Neither prices an insert hang.

After using this, you can now send an insert price that already
includes the liner and the extras, which used to take a guess from a
published installed special.

## How it works

1. **Fuel, size, and chimney scope.** A small gas cassette is not a
   large wood insert and is not a pellet unit that needs a dedicated
   circuit. A rebuild package is not liner footage.
2. **The liner as its own hours.** Stainless liner footage is billed
   per foot. Zero footage still prices — liner hours are zero, not an
   error. A rebuild does not also bill liner.
3. **Hearth, gas, circuit, surround, and damper as their own hours.**
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
wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, fuel, size, chimney, and access presets ship with common
ballpark hours and material figures. **They are not an industry
standard or a fireplace design.** Changing fuel, size, chimney, or
access never overwrites a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `fireplace-insert-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One fireplace / one trip. A whole-house chimney rebuild, a custom
  millwork surround drawing, or a standalone wood stove on an exterior
  chase is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price a CSIA chimney sweep or a full chimney rebuild sold
  as the house.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
