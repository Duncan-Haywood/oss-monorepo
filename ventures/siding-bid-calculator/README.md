# Siding Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/siding-bid-calculator/>

A free browser calculator for siding contractors. It prices a job the way
the trade actually loses money when they skip it — net wall squares plus
waste, then stories, tear-off, openings, linear trim, and margin — and
shows the walk-away number before a price-per-square-foot special goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/siding-bid-calculator -p 8080
# Run the tests
cd ventures/siding-bid-calculator && node --test
```

After using this, you can now **quote siding from net squares, waste, height,
and trim instead of a flat house price**, which used to take a spreadsheet
that still hid the dumpster and the burden.

## The problem it solves

Siding crews are told to bid “the house” or “eight dollars a foot.” That
rule cannot see the job. A one-story vinyl wrap with four windows is a
different week from a two-story fiber-cement tear-off with gables, twelve
openings, and a dumpster. Two addresses on the same street can differ by 2×
in labor and material, and those two lines are most of the cost. An $8-a-foot
special on the wrong one is a Saturday the crew works at a loss.

The second thing that sinks these quotes is waste, linear trim, and payroll
burden. Ten percent waste on a 17-square house is almost two extra squares
you buy and hang. J-channel and corners are priced by the foot, not the
square. An installer paid $32 often costs more than $42 once employer taxes,
ladder-and-tear-off workers’ compensation, liability, and paid time off are
counted. Contractors who price off the raw wage and “figure trim in” are
short before they start.

## How it works

1. **Per-elevation area.** Each row is a wall with length and height. Openings
   subtract from the total once.
2. **Waste.** Net square feet become squares (100 sq ft), then waste turns
   those into the billable squares you actually buy and hang.
3. **Height and extras.** Stories multiply install hours. Tear-off, housewrap,
   and each opening add time. Scaffold and soffit/fascia are optional add-ons.
4. **Linear trim.** Starter, corners, J-channel, and undersill are hours and
   material by the foot — the line a price-per-square-foot bid goes quiet on.
5. **Travel and minimum.** Miles are a round trip. If on-site time would
   land under the minimum, the job is padded to that minimum.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Labor + siding + wrap + trim + add-ons + dumpster + trip +
   other + overhead) ÷ (1 − target margin %), because margin is a share of
   the price the homeowner sees.

It then reports the numbers a contractor sanity-checks a quote against:
price per billable square, price per net square foot, effective hourly
billing rate, the area split across elevations, and the **walk-away price**
— total cost, below which the job makes nothing. Entering a price already
on the table scores it against the same cost base and says plainly whether
it is under water. **Copy quote summary** turns the result into a plain-text
draft. **Copy share link** puts the same figures in the page hash so the
recipient computes the same profit the sender saw.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is an allowlist ([`share.mjs`](share.mjs)) so a
dropped field cannot silently change the quote. See the `*.test.mjs` files.

## Starting hours and material

The material types ship with common ballpark hours, waste, and material
costs as a starting point. **They are not a manufacturer price list, a
building-code table, a benchmark, or a guarantee, and they are not a finding
that any wall is weathertight, permitted, or due for replacement.** Real
times and invoices depend on the crew, the house, the product, and what is
actually found on site. Every rate is editable, and picking a material type
never overwrites a figure the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `siding-bid-usage` — never the address, wall sizes,
wages, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
A share link encodes only the quote fields in the URL hash; it is not sent
to us. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `wall_added`, `wall_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax or permit handling; the contractor enters their
  own numbers.
- One house, not a multi-building HOA or a commercial panel system.
- Starting hours are ballpark, not timed from a particular crew or region.
- Access issues (locked gates, occupied rooms, rotten sheathing) are not
  modelled beyond the other-cost field and the scaffold add-on.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or
engineering advice, and it does not replace a qualified professional. It is
not a manufacturer, building-code, or insurance inspection, and it does not
determine that any wall is weathertight or due for replacement. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
