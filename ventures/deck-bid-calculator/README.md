# Deck Bid Calculator

A free browser calculator for deck builders. It prices a residential deck the
way the trade actually loses money when they skip it — each surface by height
and material, then railing lineal feet and stairs — and shows the walk-away
number before a $28-a-foot postcard goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/deck-bid-calculator/

**After using this, you can now hold a walk-away price that includes height,
rail, and stairs, which used to take a spreadsheet that most crews never
opened on a Saturday estimate.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/deck-bid-calculator -l 8080
# Run the tests
cd ventures/deck-bid-calculator && node --test
```

Search page: [`how-much-to-charge.html`](how-much-to-charge.html). See
[this calculator vs. QuoteIQ](vs-quoteiq.html) for which job fits a one-off
bid check versus an ongoing, paid quoting and job-costing app, or
[this calculator vs. a flat $28-a-foot estimate](vs-a-flat-28-a-foot-estimate.html)
for worked examples of where a per-square-foot rate stops covering the job.

## The problem it solves

Homeowners and competing crews quote decks by the square foot. That rule
cannot see the job. A 14×20 patio ten inches off grade is 280 square feet. A
14×20 elevated deck eight feet up is also 280 square feet. The second one
needs more posts, usually a guard, fall-protection time, and often a stair
run. Railing is a lineal-foot product; on an elevated deck it is often a
large share of the ticket. Tear-out is disposal plus labor. A postcard
special priced as “new only” still has to haul the old one.

Payroll burden is the other silent miss. A carpenter paid $42 costs more like
$55 once employer taxes, workers' compensation, liability, and paid time off
are counted.

## How it works

1. **Per-surface takeoff.** Each row is length × width, height above grade,
   and a material system (pressure-treated, cedar, composite, PVC). Height
   multiplies framing hours and post-set time. Material changes both the
   lumber ticket and the decking hours, including a waste factor.
2. **Railing and stairs.** Rail is priced by lineal foot and style. Each
   stair run is width and riser count — carpentry the square-foot rule never
   saw. A takeoff at typical guard height (about 30 inches) with zero railing
   lineal feet is flagged; that is the failure this tool exists to catch.
3. **Tear-out and footings.** Demo square feet become hours plus disposal.
   Footing counts are a span estimate from surface size and height — not an
   engineered layout — then multiplied by your cost per footing.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %), including travel
   as a round trip and a minimum on-site floor.
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price. The walk-away price is total cost.

Entering a price already on the table scores it against the same cost base
and says plainly whether it is under water. **Copy quote summary** turns the
result into a plain-text draft. **Copy share link** puts an allowlisted hash
on the URL so height, railing, stairs, demo, and margin all survive — a
dropped field is how two people compute different profits from the “same”
link.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs) and [`share.mjs`](share.mjs).

## Starting rates

Material prices, hours, height multipliers, and railing rates ship as common
ballpark figures. **They are not a lumberyard quote, an IRC table, a stamped
calculation, or a guarantee.** Real numbers depend on the crew, the yard, the
soil, the span, and the jurisdiction. Every rate is an input.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `deck-bid-usage` — never the address, sizes, wages,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. A share link
encodes only the allowlisted quote fields in the page hash; it is not sent
to us. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `page_viewed`, `bid_calculated`, `section_added`,
`section_removed`, `stair_added`, `stair_removed`, `proposed_price_compared`,
`summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- Footing counts are a span estimate, not an engineered layout.
- Height and guard notes are estimating aids, not a building-code determination.
- No ledger-board, flashing, lighting, or skirting takeoff yet.
- Distinct from the fence calculator (posts and gates) and the concrete
  calculator (slabs), and from any interior flooring tool.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or engineering
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

It does not tell anyone what to charge or whether a deck may be built. It is
not a building-code, structural, guardrail, permit, or insurance inspection.

MIT licensed — see [`LICENSE`](LICENSE).
