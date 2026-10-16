# Window Cleaning Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/window-cleaning-bid-calculator/>

A free browser calculator for independent window-cleaning operators. It prices
a visit the way the jobs that lose money actually fail — each glass type timed
per pane and per side, plus the travel-and-setup block that does not shrink
when the house is small — and shows the margin before the price goes out.

**After using this, you can now name a visit price from your own pane times
and drive time**, which used to take a copied per-window flyer and a guess.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/window-cleaning-bid-calculator -p 8080
# Run the tests
cd ventures/window-cleaning-bid-calculator && node --test
```

## The problem it solves

Homeowners and storefront managers ask for a price per window. Operators who
answer that way underprice three things a flyer cannot see:

1. **Glass type.** Ten French or divided-light panes, both sides, are not ten
   ground-floor plates on a water-fed pole. The labor difference is often
   3–4×, and it is the part of the elevation that looks "just a few more
   windows."
2. **Travel and setup.** Drive, park, hose-up, and pack-out happen once. An
   8-pane ranch 25 minutes away is mostly windshield time. That is why a
   minimum job charge exists — not to pad profit, but to cover a block that
   does not shrink.
3. **Payroll burden.** A cleaner paid $20 costs more like $25 once employer
   taxes, workers' compensation, and insurance are counted. Pricing off the
   raw wage is short before the first pane.

## How it works

1. **Per-type labor.** Each row is a glass type with pane count, minutes per
   pane on one side, and sides (1 = in-only or out-only, 2 = both). Minutes =
   panes × minutes-per-pane × sides.
2. **Travel.** A single minutes-per-visit input, added to pane time. It is
   reported as a share of the visit so a small stop cannot hide that most of
   the invoice is the drive.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Other direct cost.** Supplies, fuel, parking, lift rental — per visit.
5. **Overhead.** A percentage markup on that direct cost. It is not applied
   to itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), then lifted to the minimum job
   charge if you have one. Margin is a share of price, not a markup on cost.
7. **Recurring.** Visits per month (0 = one-off) scale the monthly figures
   without changing the one-visit hours.

It then reports the numbers an operator sanity-checks a bid against: price
per pane, effective hourly billing rate (including the drive), the travel
share, the labor split across glass types, and the **walk-away price** —
cost per visit, below which the stop makes nothing. Entering a price already
on the table scores it against the same cost base. **Copy bid summary** turns
the result into a plain-text draft ready to paste into a text or estimate.

The method in words, aimed at the search query operators actually type:
[`how-much-to-charge-per-window.html`](how-much-to-charge-per-window.html).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting minutes

Glass types ship with common ballpark minutes as a starting point. **They are
not an industry standard, a benchmark, or a guarantee.** Real times depend on
soil, water, access, restoration work, and the crew. Every rate is editable,
and picking a type never overwrites minutes or sides the operator has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `window-cleaning-bid-usage` — never the stop, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `group_added`, `group_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the operator enters their own numbers.
- Access method (pole vs ladder vs lift) is encoded in the minutes preset,
  not as a separate equipment-rental line beyond "other per visit."
- Weather, cancellation, and water-source constraints are out of scope.
- One crew / one visit model. Split crews and multi-day commercial take-ons
  are not priced separately yet.

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does
not tell anyone what to charge. Outputs are arithmetic on the user's own
inputs. Verify every figure against real payroll, insurance, drive time, and
supply costs and against a qualified professional before relying on it or
submitting a bid. To the maximum extent permitted by law, the authors accept
no liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
