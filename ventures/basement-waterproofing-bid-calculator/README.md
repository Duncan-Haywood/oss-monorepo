# Basement Waterproofing Bid Calculator

A free browser calculator for waterproofing contractors. It prices an interior
French drain, exterior excavation, or crawl-space encapsulation the way the
trade actually loses money — wall membrane from height, window wells, crack
injection, a new sump versus an existing pit, backup pump, and freeze-protected
discharge — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/basement-waterproofing-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/basement-waterproofing-bid-calculator -p 8080
# Run the tests
cd ventures/basement-waterproofing-bid-calculator && node --test
```

See [this calculator vs. Oblyss](vs-oblyss.html) for which job fits a
one-off bid check versus an ongoing, paid CRM and warranty-tracking
platform, and
[this calculator vs. a flat rate per lineal foot](vs-a-flat-rate-per-lineal-foot.html)
for why a shorter, well- and pit-heavy job can cost more than a longer,
simpler one.

After using this, you can now send a walk-away price that includes the first
window well and a new pit, which used to take a per-lineal-foot guess that
matched a cheaper brochure job.

## The problem it solves

Independent waterproofing contractors get shopped on a published **price per
lineal foot of drain tile**. Homeowners can measure the perimeter. They cannot
see that a 55 lf seepage house with four window wells and a new sump consumes
more hours than an 80 lf finished basement with an existing pit. Matching the
brochure job's per-foot number on the seepage house is how a sold waterproofing
job becomes a two-day loss.

The second thing that sinks these bids is treating exterior excavation as a
markup on interior drain. Spoil, membrane, and a yard to restore do not scale
with the same lineal-foot rate. On the sample 100 lf exterior job they are more
labor than the interior brochure job of similar footage.

## How it works

1. **Wells, pit, and discharge, not just lineal feet.** Interior drain hours
   sit on the perimeter. Window wells, a new pit, backup pump, and
   freeze-proof discharge stay their own hours so a cheap per-foot quote
   cannot hide them.
2. **Wall membrane from height.** Membrane area = perimeter × wall height.
   An 8-foot seepage wall is not a 7.5-foot finished basement.
3. **Three systems.** Interior French drain (cut, haul, pipe, pour-back),
   exterior excavation (spoil and yard restore), and crawl encapsulation
   (floor vapor + wall liner). They share a cost sheet; they do not share a
   rate.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
lineal foot, effective hourly billing rate, the hour split, and the
**walk-away price** — total cost, below which the job makes nothing. Entering
a price already on the table scores it against the same cost base and says
plainly whether it is under water. **Copy bid summary** turns the result into
a plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

Search intent lives on
[How much to charge for basement waterproofing](how-much-to-charge-for-basement-waterproofing.html).

## Starting rates

Drain hours, membrane rates, well hours, and pump costs ship as common
ballpark figures. **They are not an industry standard, a dry-basement
warranty, a hydrostatic-pressure guarantee, or an engineering
specification.** Real production depends on slab thickness, soil, access, and
how the crew actually cuts. Every rate is editable, and picking a system,
pump, or backup never overwrites a figure the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `basement-waterproofing-bid-usage` — never the
basement, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no sales-tax handling; the contractor enters their own numbers.
- One basement at a time. Commercial foundations, French drains in yards with
  no structure, and foundation-repair helical piers are not priced separately yet.
- Interior versus exterior is a system choice, not a mixed takeoff of both
  on the same wall.
- Water-entry diagnosis, pump sizing, and discharge freeze risk are the
  contractor's judgment, not an output of this tool.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not waterproofing, construction, engineering,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
