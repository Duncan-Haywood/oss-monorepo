# Kitchen Hood Cleaning Bid Calculator

A free browser calculator for commercial kitchen exhaust cleaning
contractors. It prices a restaurant hood-cleaning stop the way the trade
actually loses money by skipping — canopy, filters, duct, and fan as
separate labor — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/hood-cleaning-bid-calculator/

**After using this, you can now send a system price (and know the hood-only
number that would have lost the job), which used to take a spreadsheet
rebuild every time a rooftop fan or vertical chase showed up.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/hood-cleaning-bid-calculator -p 8080
# Run the tests
cd ventures/hood-cleaning-bid-calculator && node --test
```

## The problem it solves

Small exhaust-cleaning contractors are told to bid per hood. That rule
cannot see the system. A 10-foot canopy with eight feet of horizontal duct
is a short stop. The same canopy with twenty feet of vertical duct and a
rooftop fan through a hatch is most of a half-day for a two-tech crew. Two
kitchens that look identical from the dining room can differ by more than
the typical profit margin on the route.

The second thing that sinks these bids is after-hours and access. Most
restaurant work happens after close. A 25% after-hours premium on on-site
labor, plus a 1.7× rooftop-hatch multiplier on the fan and the vertical
run, is the part that never appears on a "we charge $X a hood" card. A
contractor who prices off the canopy length is short before they start.

## How it works

1. **System labor.** Each row is a component — canopy square feet, filters,
   horizontal duct, vertical duct, rooftop or wall fan, makeup air,
   clean-out doors — with its own quantity, minutes per unit, and access
   multiplier. Technician-hours = quantity × minutes × access × grease-load
   ÷ 60.
2. **Grease load.** A multiplier on those production minutes. Light cooking
   is 1.0; extra-heavy (24-hour, wok, solid fuel) is 2.1. Starting points
   only.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %). After-hours
   premium applies to on-site labor only. Travel is round-trip hours ×
   techs paid for the drive.
4. **Other direct cost.** Chemicals per job and per canopy square foot,
   grease disposal, and anything else billed to the stop.
5. **Overhead.** A percentage markup on that direct cost. It is not applied
   to itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against:
effective hourly billing rate, annual contract value, monthly equivalent,
the hour split across hood / duct / fan, the **hood-only price** (what the
same stop would have bid if duct and fan were ignored), and the
**walk-away price** — total job cost, below which the stop makes nothing.
Entering a price already on the table scores it against the same cost base
and says plainly whether it is under water. **Copy bid summary** turns the
result into a plain-text draft ready to paste into a proposal.

Cleans per year is the contract cadence you and the operator agree. Grease
load suggests a starting cadence; it never overwrites a number you have
already changed. **This is not an NFPA 96 determination** and it does not
tell anyone how often a hood must be cleaned.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting minutes

The components ship with common ballpark minutes as a starting point.
**They are not an industry standard, a benchmark, or a guarantee.** Real
minutes depend on the crew, the grease, the access, and whether the duct
has clean-outs. Every rate is editable, and picking a component type never
overwrites minutes the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `hood-cleaning-bid-usage` — never the kitchen, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `component_added`, `component_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One cleaning-and-contract model. New-construction wrap, fan replacement,
  and fire-restoration work are not priced separately yet.
- "Other component" rows are labelled `Component N` rather than a custom name.
- Frequency suggestions are starting points for a contract, not a required
  interval.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
fire-code, or business advice, and it does not replace a qualified
professional or the authority having jurisdiction. **You are responsible
for reviewing and verifying its output before relying on it**, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
