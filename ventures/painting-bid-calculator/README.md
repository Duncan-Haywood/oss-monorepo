# Painting Bid Calculator

A free browser calculator for independent interior painters. It prices a
repaint the way the trade actually estimates one — each surface divided by the
production rate the painter really hits — and shows the margin before the
price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/painting-bid-calculator/

**After using this, you can now see the job price, the walk-away number, and
whether a $2/sq ft floor bid covers cost**, which used to take a spreadsheet
that still hid trim and door hours inside a blended rate.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/painting-bid-calculator -p 8080
# Run the tests
cd ventures/painting-bid-calculator && node --test
```

## The problem it solves

Homeowners and discount competitors quote interior painting as a price per
floor square foot. That rule cannot see the shape of the house. A 1,200 sq ft
3-bedroom with 320 feet of trim and eight doors spends a large share of its
labor on surfaces that barely appear in the floor plan. Two houses of
identical floor area can differ by 30% in hours, and labor is most of the
cost. A per-square-foot bid on the heavier one is a job the painter finishes
at a loss.

The second thing that sinks these bids is treating a second coat as free, or
as a full second first coat. Second-coat time is real and usually shorter.
The calculator makes that factor an input instead of burying it.

## How it works

1. **Per-surface labor.** Each row is a surface with its own quantity,
   production rate, and coat count. First-coat hours = quantity ÷ rate.
   Extra coats use the extra-coat factor (default 0.65 of first-coat time).
   Wall rows also take a ceiling-height factor above 9 ft.
2. **Prep and setup.** Hours that are not a surface — patching, caulking,
   masking, daily setup — sit outside the surface split so they stay visible.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Paint.** Paintable square feet × coats × (1 + waste %) ÷ coverage, then
   times the price per gallon. Trim, doors, and windows convert to area with
   disclosed per-unit factors so gallons stay checkable.
5. **Overhead.** A percentage markup on direct cost. It is not applied to
   itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a painter sanity-checks a bid against: price per
floor square foot, price per paintable square foot, effective hourly billing
rate, the labor split across surfaces, and the **walk-away price** — total job
cost, below which the job makes nothing. Entering a price already on the table
scores it against the same cost base. Entering a common $/floor-sq-ft rule of
thumb shows whether that popular number is underwater on *this* house.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Save and share

Inputs are saved in the browser and restored on the next visit. **Copy
shareable link** writes the current numbers into the page URL. A link's
values always take precedence over whatever a browser had saved. The link
contains only the numbers in the form.

## Production rates

The surface types ship with common ballpark rates as a starting point. **They
are not an industry standard, a benchmark, or a guarantee.** Real rates
depend on the painter, the house, the paint, and how much prep is already
done. Every rate is editable, and picking a surface type never overwrites a
rate the painter has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only things stored
locally are the numbers you typed (so they can be restored — clear them with
**Reset to defaults**) and, unless you opt out, an anonymous tally of which
features were used and the current date, in `localStorage` under
`painting-bid-usage` — never the house, wages, costs, or prices. It is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `surface_added`, `surface_removed`,
`proposed_price_compared`, `share_copied`, `reset_defaults`.

## Limitations

- Single currency and no tax or permit handling.
- Interior production-rate model. Exterior, spray, cabinet refinishing as a
  full shop job, and multi-crew scheduling are not priced separately yet.
- Per-unit paint-area factors for trim/doors/windows are disclosed starting
  points, not measured takeoffs.
- "Other surface" rows are labelled `Surface N` rather than a custom name.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or business
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
