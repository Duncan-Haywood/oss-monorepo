# Quartz & Granite Countertop Bid Calculator

A free browser calculator for stone fabricators. It prices a quartz or granite
kitchen the way the shop actually loses money — layout waste into whole slabs,
polished sink and cooktop holes, edge profile, backsplash, and waterfall ends —
and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/countertop-bid-calculator -p 8080
# Run the tests
cd ventures/countertop-bid-calculator && node --test
```

After using this, you can now send a walk-away price that includes the second
slab and the polished holes, which used to take a per-square-foot guess that
matched a cheaper galley quote.

## The problem it solves

Independent fabricators get shopped on a published **price per finished square
foot**. Homeowners can measure the tops. They cannot see that a 28 sq ft island
with two waterfall ends consumes two 46 sq ft slabs, while a 40 sq ft galley
with a drop-in sink fits one. Matching the galley's per-square-foot number on
the island is how a sold waterfall becomes a loss.

The second thing that sinks these bids is treating an undermount, an ogee edge,
and a 4-inch splash as a blended "add 20%". Those hours do not scale with the
finished footage. On the sample 55 sq ft L-kitchen they are more labor than the
field cut itself.

## How it works

1. **Slabs, not finished feet.** Required stone = (finished top + waterfall
   area + backsplash) × (1 + layout waste %). Slabs = that number rounded up
   by the usable square feet of one slab. A typical quartz slab is about 46
   usable square feet — a starting point, not a mill ticket.
2. **Cutouts as their own hours.** Drop-in, undermount, farmhouse, cooktop, and
   faucet holes stay off the field rate so a polished hole cannot hide inside
   a per-square-foot special.
3. **Edges, seams, and splash.** Lineal-foot labor on the finished perimeter
   and the backsplash. Mitered laminated edges are a different job from eased.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: slabs in the
takeoff, price per finished square foot, effective hourly billing rate, the
hour split, and the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the same cost
base and says plainly whether it is under water. **Copy bid summary** turns the
result into a plain-text draft with wages omitted, ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

Search intent lives on
[How much to charge to install quartz countertops](how-much-to-charge-to-install-quartz-countertops.html).

## Starting rates

Layout waste, slab size, sink hours, and edge hours ship as common ballpark
figures. **They are not an industry standard, a color match, a yield
guarantee, or a stone specification.** Real yield depends on the slab lot, the
sink model, and how the shop nests the pieces. Every rate is editable, and
picking a layout, material, sink, or edge never overwrites a figure the
fabricator has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `countertop-bid-usage` — never the kitchen, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no sales-tax handling; the fabricator enters their own numbers.
- One kitchen at a time. Commercial runs, outdoor kitchens, and fireplace surrounds are not priced separately yet.
- Slab nesting is a waste percent, not a true nest of pieces on a CAD drawing.
- Color, lot, and vein matching are the fabricator's judgment, not an output of this tool.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not stone, construction, legal, tax, or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
