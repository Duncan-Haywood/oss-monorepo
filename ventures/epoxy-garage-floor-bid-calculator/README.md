# Epoxy Garage Floor Bid Calculator

A free browser calculator for garage-floor coating contractors. It prices an
epoxy, flake, metallic, or 1-day polyaspartic job the way the trade actually
bids one — grind hours, flake load, waste, cracks, and the drive — and shows
the margin before the price goes out.

**After using this, you can now send a two-car flake number that includes the
grind and the bags, which used to take a copied $4/sq ft special and a guess.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/epoxy-garage-floor-bid-calculator -p 8080
# Run the tests
cd ventures/epoxy-garage-floor-bid-calculator && node --test
```

## The problem it solves

Homeowners search “how much to charge for an epoxy garage floor” and shops
answer with a flyer number. Two mistakes lose money:

1. A **$4/sq ft special** that only degreases. Full diamond grind on a 400 sq
   ft two-car is often as many hours as the coats. Skipping mechanical prep is
   how the job comes back as hot-tire pickup and peel.
2. **Guessing flake as a couple of bags.** Full-broadcast flake is typically
   0.15–0.25 lb per square foot. Waste on the billable area, not the tape
   measure, is what the kit invoice matches.

Polyaspartic is a third trap: shops add a flat premium to an epoxy number.
The kit is more expensive; coat hours drop; the grind does not. See
[`how-much-to-charge-for-an-epoxy-garage-floor.html`](how-much-to-charge-for-an-epoxy-garage-floor.html)
and
[`how-much-to-charge-for-polyaspartic-garage-floor.html`](how-much-to-charge-for-polyaspartic-garage-floor.html).

This is a different job from a concrete pour (cubic yards) and from interior
flooring (LVP / hardwood / tile). The unit of work is a profiled slab plus a
coating system.

## How it works

1. **Slab.** Width × length, or a 1-/2-/3-car preset. Waste applies to coats
   and flake, not to the moisture barrier (that goes on the concrete once).
2. **Prep hours.** Square feet ÷ grind or etch rate. Degrease-only is flagged
   on flake, metallic, and polyaspartic jobs.
3. **Coat hours.** Billable square feet ÷ coat rate × coats.
4. **Patch.** Cracks and pits as extra hours and extra fill.
5. **Travel.** Round-trip miles ÷ mph × loaded wage, plus $/mile.
6. **Loaded labor.** Wage × (1 + payroll burden %).
7. **Price.** Direct cost (labor, vehicle, kit, flake, patch, other), then
   overhead as a markup on that direct cost, then price = cost ÷ (1 − margin),
   because margin is a share of the number you send.

It reports price per square foot, effective hourly rate, flake pounds, the
hour split, and the **walk-away price**. Enter a flyer number to see whether
it is under water. **Copy bid summary** pastes a plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `epoxy-garage-floor-bid-usage` — never the slab,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `garage_size_changed`, `system_changed`,
`prep_changed`, `moisture_toggled`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or permit handling.
- One slab per bid. Multi-bay commercial floors and decorative borders are
  out of scope for v0.
- Starting kit prices and grind rates are ballpark figures, not coverage
  guarantees or a surface-profile specification.
- No moisture-test interpretation and no product-warranty language.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or business advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
