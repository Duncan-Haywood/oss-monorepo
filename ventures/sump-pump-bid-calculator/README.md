# Sump Pump Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sump-pump-bid-calculator/>

A free browser calculator for plumbers and basement shops. It prices a
sump-pump install the way the trade actually loses money — a new basin
versus an existing-pit swap, extra discharge past the included first
fifteen feet, battery or water-powered backup, alarm, and freeze
protection as their own hours — and shows the margin before the price
goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/sump-pump-bid-calculator -p 8080
# Run the tests
cd ventures/sump-pump-bid-calculator && node --test
```

## The problem it solves

Small plumbing and basement shops are told to bid by a published "$450
pump swap" special, or by a coupon-site replacement price. That rule
cannot see the house extras. A 1/3 HP swap in an existing pit with
fifteen included feet of discharge is not the same job as a new basin
cut through a concrete slab, a 1/2 HP pump, forty feet of discharge, a
battery backup, and a high-water alarm. The trip is the same. The hours
are not. Matching a cheaper special written for the brochure swap is
how a sold new-pit-and-battery job becomes a two-day loss after the
first saw cut.

Basement-*waterproofing* calculators price interior drain tile, French
drains, and crawl encapsulation. *Well-pump* calculators price depth, a
pitless adapter, and a pressure tank. Neither prices a sump.

After using this, you can now send a sump-pump price that already
includes the pit, extra discharge, and backup, which used to take a
guess from a published swap special.

## How it works

1. **Pump, pit, and backup.** A 1/3 HP existing-pit swap is not a 1/2
   HP new basin through a slab and is not a 3/4 HP crawl install with
   a water-powered backup.
2. **Footage past the included discharge.** The special includes a
   stated footage. Everything past that is billed as its own hours. A
   shorter run than the included footage still prices — extra footage
   is zero, not an error.
3. **Pit, slab cut, backup, alarm, and freeze protection as their own
   hours.** A swap-only special is not a new-pit package. The battery
   kit is often more than the primary pump.
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

The job, pump, pit, and backup presets ship with common ballpark hours
and material figures. **They are not an industry standard or a
drainage design.** Changing pump, pit, or backup never overwrites a
rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `sump-pump-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One install / one trip. A whole-house waterproofing system, a well-pump
  changeout, or a sewage ejector is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price basement waterproofing or well-pump work.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
