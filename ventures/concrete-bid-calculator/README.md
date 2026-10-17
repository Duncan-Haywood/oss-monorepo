# Concrete Bid Calculator

A free browser calculator for independent concrete contractors. It prices a
driveway, patio, sidewalk, or slab the way the trade actually bids one —
area times thickness for cubic yards, forms by the edge, finish by the
surface — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/concrete-bid-calculator/

**After using this, you can now send a pour price that already includes the
extra yards from thickness, the plant's quarter-yard ticket, the short-load
fee, and the access method, which used to take a spreadsheet and still
missed one of those four.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/concrete-bid-calculator -p 8765
# Run the tests
cd ventures/concrete-bid-calculator && node --test
```

## The problem it solves

Homeowners and GCs ask for a price per square foot. Concrete is sold by the
cubic yard. A 20×40 driveway at 4 inches is 9.88 yards; the same pad at
6 inches for an RV is 14.81 yards — 50% more material, same sketch. Forms
are priced by linear feet of edge. Stamped finish takes two to three times
the labor of broom. A pump is a few hundred dollars; a wheelbarrow run is
hours. Many plants add a short-load fee under about five yards, which is
how a "cheap" stoop loses money.

Contractors who quote a blended square-foot number absorb every one of
those differences.

## How it works

1. **Yards from thickness.** Each slab is length × width × thickness (in) ÷
   12 ÷ 27. Waste (over-excavate and spill) is applied next. The plant
   ticket is that volume rounded up to a quarter yard — the number you
   actually pay.
2. **Forms from the edge.** Perimeter = 2 × (length + width) when the tape
   measures are entered. Form material is priced per linear foot; set-and-
   strip hours are a separate labor line.
3. **Finish labor.** Hours per 100 square feet, started from a broom /
   trowel / exposed / stamped preset and overwritten by a time from the
   contractor's own crew.
4. **Access and extras.** Chute, wheelbarrow, or pump; short-load fee
   under a yard threshold; demo haul in yards of the *old* slab; payroll
   burden on a blended crew wage.
5. **Price.** Direct cost + overhead, then cost ÷ (1 − target margin %),
   because margin is quoted as a share of price.

It then reports the numbers a contractor sanity-checks a bid against: price
per square foot, price per cubic yard, effective hourly rate, and the
**walk-away price**. Entering a price already on the table scores it against
the same cost base. **Copy bid summary** turns the result into a plain-text
draft ready to paste into a proposal. Save and reload recurring bid drafts
locally on the same device without creating an account.

A satellite page, [`how-much-concrete-for-a-driveway.html`](how-much-concrete-for-a-driveway.html),
answers the search question in the homeowner's words and links into the bid
tool.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

Finish hours, reinforcement dollars, and pump fees ship as common ballpark
starting points. **They are not an industry standard, a benchmark, or a
guarantee.** Real numbers depend on crew, weather, slump, decorative
finish, and the local plant. Every rate is editable, and picking a finish
or access method never overwrites a figure the contractor has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `concrete-bid-usage` — never the job, yards, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `slab_added`, `slab_removed`,
`proposed_price_compared`, `summary_copied`, `draft_saved`, `draft_loaded`,
`draft_cleared`.

## Limitations

- Single currency and no tax or permit-fee schedule; the contractor enters
  their own numbers.
- No mix design, slump, PSI, or reinforcement layout. Those are engineering
  questions this tool does not answer.
- Perimeter is computed from length × width. A slab entered only as square
  footage needs a perimeter override (not yet a per-row field on the page —
  add a dummy length and width, or put form cost in "other").
- One pour. Multi-day or multi-crew schedules are not modelled.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or business advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and never changes what the tool does.

MIT licensed — see [`LICENSE`](LICENSE).
