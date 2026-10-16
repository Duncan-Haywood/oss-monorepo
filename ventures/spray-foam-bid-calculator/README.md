# Spray Foam Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/spray-foam-bid-calculator/>

A free browser calculator for spray-foam insulation crews. It prices a
residential foam job from the board feet an attic-square-foot special cannot
see, the cell (open, closed, or hybrid), the rim joists, and the ignition
coating — and shows the margin before the price goes out.

**After using this, you can now send a spray-foam price that includes board
feet, the rim, and the coating**, which used to take a spreadsheet that still
started from the coupon’s attic square feet.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/spray-foam-bid-calculator -p 8080
# Run the tests
cd ventures/spray-foam-bid-calculator && node --test
```

Search page: [`how-much-to-charge-for-spray-foam-insulation.html`](how-much-to-charge-for-spray-foam-insulation.html).

## The problem it solves

Small crews are shopped on a published “$3.50 / sf of attic” special written
for bags of blown-in. That number counts attic floor. It cannot see that
1,200 square feet of 8" open-cell is 9,600 board feet — plus waste, plus
almost always a closed-cell rim that is lineal feet times joist height times
inches, plus an ignition coating on exposed foam. Matching the attic-square-
foot special is how a sold 8" attic becomes a drum-short loss after the first
rim bay.

Attic *blown-in* calculators price bags, R-delta, and baffles. Wall *batt*
quotes price cavities. None of them prices spray foam.

## How it works

1. **Sprayed plane.** Attic floor is length × width. Cathedral multiplies by
   a pitch factor. Crawl wall is perimeter × height.
2. **Board feet.** Square feet × inches. One board foot is one square foot
   one inch thick — the unit drums are sold in.
3. **Cell.** Open-cell, closed-cell, or hybrid (1" closed plus open-cell
   fill). Each cell has its own material rate.
4. **Rim.** Lineal feet × (rim height in feet) × thickness in inches. Almost
   always closed-cell, and never in the attic-square-foot coupon.
5. **Order.** Board feet × (1 + waste). Open-cell oversprays more.
6. **Price.** Loaded wage × hours, plus foam and coating, plus mobilization,
   plus overhead on that direct cost, then cost ÷ (1 − target margin %).
   Margin is a share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price
per square foot of sprayed plane, price per board foot, effective hourly
billing rate, the foam share of direct cost, and the **walk-away price** —
total cost, below which the job makes nothing. Entering a price already on
the table scores it against the same cost base and says plainly whether it is
under water. The same attic is also priced as open-cell, closed-cell, and
hybrid so a coupon written for attic square feet cannot hide that those
are three different board-foot jobs. **Copy bid summary** turns the result into a plain-text draft
with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Cell rates, waste percents, hours, and material rates ship as common
ballpark figures. **They are not an energy-code opinion, a permit, a
warranty, or an engineering stamp.** The nominal R figure is a starting
per-inch product, not a tested assembly. Every figure is editable, and
picking a kit never overwrites a cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `spray-foam-bid-usage` — never the spans, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`, `cell_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential spray-foam model. Commercial freezers, metal buildings, and
  full HVAC packages are not priced separately yet.
- Cell rates and waste figures are starting points, not a drum quote.
- No energy-code check, blower-door target, or inspector checklist.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
Refusing to sponsor does not change the tool.

MIT licensed — see [`LICENSE`](LICENSE).
