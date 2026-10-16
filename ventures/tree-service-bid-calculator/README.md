# Tree Service Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tree-service-bid-calculator/>

A free browser calculator for independent tree-service owners. It prices a
removal stop the way the job actually costs — wood volume from the square of
DBH, then access, targets, stump grinding, haul, travel, and the loaded crew —
and shows the margin before the price goes out.

**After using this, you can now send a stop price that already includes stump,
haul, and the drive**, which used to take a hood-of-the-truck guess that
underpriced the big backyard tree and overpriced the street ornamental.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/tree-service-bid-calculator -p 8080
# Run the tests
cd ventures/tree-service-bid-calculator && node --test
```

## The problem it solves

Small tree crews are told to bid by the inch or by the day. Both rules miss the
shape of the stop. A 24-inch backyard oak next to the house is about four times
the wood of a 12-inch street pine, not twice, because trunk volume scales with
the square of diameter. Access (chipper at the tree vs. a backyard carry vs. a
crane) and targets (house, power) then change the hours more than species does.
A blended “two trees, $1,800” quote that looked fine is how the oak eats the
week and the pine was never the problem.

The four lines that then sink the bid are stump grinding, haul and dump,
travel for the whole crew and chipper, and payroll burden. Workers’
compensation in this trade is expensive. A climber paid $35 is not a $35 hour.

## How it works

1. **Per-tree removal hours.** `(DBH ÷ 12)² × species × height factor × access
   × (1 + hazard premiums)`. Height is relative to a 50-foot reference and
   clamped so a 10-foot ornamental is not free and a 120-foot pine is not
   unbounded.
2. **Stump and haul.** Stump grind hours grow with the stump's cross-sectional
   area — diameter squared, the same shape as removal hours above — because a
   grinder wheel sweeps the whole face, not just a line across it. Haul is a
   share of the wood-volume hours plus a dump ticket when you actually leave
   the site with wood or chips.
3. **Travel once.** Round-trip minutes become hours for the whole crew, billed
   once for the stop, not once per tree. A crane day is charged once if any
   tree needs a crane.
4. **Loaded labor.** Whole-crew hourly wage × (1 + payroll burden %).
5. **Equipment.** Chipper, truck, and fuel on on-site hours only, plus dump
   and anything else billed to the stop.
6. **Overhead, then price.** Overhead is a markup on direct cost. Price is
   cost ÷ (1 − target margin %), then lifted to the mobilization minimum if
   the priced job is a 20-minute drive for a 6-inch tree.

It then reports the numbers an owner sanity-checks a bid against: price per
inch of total DBH, effective crew hourly, the walk-away (total cost), the
quote floor (cost or minimum), and which tree is carrying the job. Entering a
price already on the table scores it against the same cost base and says
plainly whether it is under water or under the minimum. **Copy bid summary**
turns the result into a plain-text draft ready to paste into a proposal.

The method is also written for search and assistants as
[`how-to-bid-tree-removal.html`](how-to-bid-tree-removal.html).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Hour factors

Species, access, and haul ship with starting factors. **They are not an
industry standard, a benchmark, or a guarantee.** Real hours depend on the
crew, the gear, the species on that street, and how the tree actually fails.
Every wage and fee is editable. Time your own crews.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `tree-service-bid-usage` — never the address, trees,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `tree_added`, `tree_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or permit handling; the owner enters their own numbers.
- One stop at a time. Recurring pruning contracts and storm-work day rates are
  not modelled yet.
- Crane is a day rate, not an hourly crane with an operator split.
- No species-by-species wood-density table — four buckets (softwood, mixed,
  hardwood, palm) on purpose, so the estimator still has to look at the tree.
- Not a tree appraisal, hazard rating, or a recommendation to remove anything.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, medical, or
engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
