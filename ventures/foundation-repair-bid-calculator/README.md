# Foundation Repair Bid Calculator

A free browser calculator for foundation-repair contractors. It prices helical
piers, hydraulic push piers, or bowed-wall stabilization the way the trade
actually loses money — extra shaft past the footage already in the pier price,
interior brackets versus exterior access, an engineering stamp, carbon-fiber
straps, and plumbing under the slab — and shows the margin before the price
goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/foundation-repair-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/foundation-repair-bid-calculator -p 8080
# Run the tests
cd ventures/foundation-repair-bid-calculator && node --test
```

After using this, you can now send a walk-away price that includes the first
interior bracket and the extra shaft, which used to take a per-pier guess that
matched a cheaper brochure job.

## The problem it solves

Independent foundation-repair contractors get shopped on a published **price
per pier**. Homeowners can count the piers. They cannot see that a 6-pier
interior house with an engineering stamp and four carbon-fiber straps consumes
more hours than an 8-pier brochure house with exterior access. Matching the
brochure job's per-pier number on the interior house is how a sold foundation
job becomes a week-long loss.

The second thing that sinks these bids is treating extra shaft as already
inside the pier price. A 14 ft stick on a house whose quote included 10 ft is
not the same material ticket as a 12 ft stick on the brochure job. On the
sample rates the 6-pier interior house prices *above* the 8-pier brochure job.

## How it works

1. **Access, extra shaft, and straps, not just pier count.** Pier hours sit
   on the count. Interior brackets, extra footage past the included depth,
   engineering, and carbon-fiber straps stay their own hours so a cheap
   per-pier quote cannot hide them.
2. **Extra shaft is only the footage past included depth.** Material for the
   first 10 ft (editable) lives in the pier price. Deeper sticks bill the
   remainder by the foot.
3. **Three methods.** Helical piers (torque and brackets), hydraulic push
   piers (drive to refusal), and bowed-wall stabilization (straps / I-beams
   with no invented pier count). They share a cost sheet; they do not share
   a rate.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
pier, effective hourly billing rate, the hour split, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a price
already on the table scores it against the same cost base and says plainly
whether it is under water. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

Search intent lives on
[How much to charge for foundation repair](how-much-to-charge-for-foundation-repair.html).

## Starting rates

Pier hours, extra-shaft rates, strap hours, and bracket costs ship as common
ballpark figures. **They are not an industry standard, a settlement
warranty, a soil-performance guarantee, or an engineering specification.**
Real production depends on soil, access, equipment, and how the crew
actually sets brackets. Every rate is editable, and picking a method never
overwrites a figure the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `foundation-repair-bid-usage` — never the house,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no sales-tax handling; the contractor enters their own numbers.
- One house at a time. Commercial foundations, new-construction piles, and
  basement waterproofing (French drain / sump) are not priced here.
- Helical versus push is a method choice, not a mixed takeoff of both on the
  same footing.
- Soil, torque, refusal, and whether a wall needs straps are the
  contractor's judgment, not an output of this tool.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not structural-engineering, construction,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
