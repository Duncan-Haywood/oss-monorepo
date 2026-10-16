# Wheelchair Ramp Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wheelchair-ramp-bid-calculator/>

A free browser calculator for accessibility and deck crews. It prices a
residential wheelchair ramp from the rise, the landings a lineal-foot special
cannot see, both-side handrails, surface, demo, and permit — and shows the
margin before the price goes out.

**After using this, you can now send a ramp price that includes the landings,
rails, and footings**, which used to take a spreadsheet that still started from
the coupon’s lineal feet.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/wheelchair-ramp-bid-calculator -p 8080
# Run the tests
cd ventures/wheelchair-ramp-bid-calculator && node --test
```

Search page: [`how-much-to-charge-to-build-a-wheelchair-ramp.html`](how-much-to-charge-to-build-a-wheelchair-ramp.html).

## The problem it solves

Small crews are shopped on a published “$85 / lf” special. That number counts
lineal feet of sloped run. It cannot see a 5×5 landing at the door, a 5×5 at
grade, a rest landing once the rise crosses about 30 inches, or a switchback
turn. A 24-inch rise at 1:12 is 24 lf of run (96 sf at 4 ft wide) plus 50 sf of
landings — 146 sf of walking surface, and the landings are more than a third of
it. Matching the platform special is how a sold 36-inch wood switchback becomes
a two-day loss after the first rest landing.

Deck *build* calculators price posts and joists as a platform. Walk-in shower
calculators price tile and glass. Neither prices a ramp.

## How it works

1. **Rise to run.** Run feet = rise inches × run-per-rise ÷ 12. 1:12 means
   twelve inches of run for each inch of rise. The shipped ratios are starting
   points, not a code opinion.
2. **Landings.** Top and bottom always. An intermediate rest landing whenever
   `ceil(rise / max-rise-between-landings) − 1` is at least one (so 30 inches
   needs none; 31 inches needs one). A switchback adds a turn landing only when
   the rise did not already rest.
3. **Walking surface.** Sloped run × width, plus every landing. That is the
   number a lineal-foot coupon cannot see.
4. **Rails and footings.** Both-side handrails when the rise is above a 6-inch
   starting threshold; footings from a pair at the house, a pair per landing,
   and posts along the run. Every count is editable.
5. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
lineal foot of run, price per walking square foot, effective hourly billing
rate, the landing share of walking surface, and the **walk-away price** — total
cost, below which the job makes nothing. Entering a price already on the table
scores it against the same cost base and says plainly whether it is under
water. **Copy bid summary** turns the result into a plain-text draft with
wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Slope ratios, landing sizes, hours, and material rates ship as common ballpark
figures. **They are not an ADA determination, a building-code opinion, a
permit, a warranty, or an engineering stamp.** Real numbers depend on the
jurisdiction, the occupant, the soil, the crew, and the inspector. Every figure
is editable, and picking a kit never overwrites a cost the contractor has
already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `wheelchair-ramp-bid-usage` — never the rise, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential-ramp model. Commercial ramps, portable aluminum rentals, and
  interior threshold ramps are not priced separately yet.
- Slope and landing figures are starting points, not a compliance check.
- No site plan, frost-depth table, or inspector checklist.

## Disclaimer

This free tool is not construction, legal, tax, financial, or engineering
advice, and it does not tell anyone what to charge or whether a layout is
compliant. Outputs are arithmetic on the user's own inputs. Verify every figure
against real payroll, insurance, and material costs and against a qualified
professional and the authority having jurisdiction before relying on it or
submitting a bid. To the maximum extent permitted by law, the authors accept no
liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
