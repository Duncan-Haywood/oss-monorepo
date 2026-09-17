# Attic Insulation Bid Calculator

A free browser calculator for insulation contractors. It prices a blown-in
attic job the way the trade actually loses money when they skip it — bags
come from the R-value *delta*, not the floor area; air sealing is a
different labor list from the blow — and shows the walk-away number before
a price-per-square-foot special goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Live at
<https://duncan-haywood.github.io/monorepo-projects/attic-insulation-bid-calculator/>.

```bash
# Serve it locally
npx http-server ventures/attic-insulation-bid-calculator -p 8080
# Run the tests
cd ventures/attic-insulation-bid-calculator && node --test
```

See [this calculator vs. FieldCamp](vs-fieldcamp.html) for which job fits a
one-off bid check versus an ongoing, paid job-management platform, and
[this calculator vs. a flat price-per-square-foot special](vs-a-flat-price-per-square-foot.html)
for where a postcard rate usually gets the job wrong.

After using this, you can now **quote blown-in attic insulation from areas,
existing versus target R-value, and bag yield instead of a flat house
price**, which used to take a spreadsheet that still hid the bag count and
the air-sealing hours.

## The problem it solves

Insulation crews are told to bid “the attic” or “a dollar fifty a foot.”
That rule cannot see the job. An attic already at R-30 going to R-38 is a
different truckload from the same attic sitting at R-13 going to R-49.
Cellulose, blown fiberglass, and mineral wool have different R-per-inch and
different cubic feet per bag. Two addresses on the same street can differ
by 2× in bags, and bags plus air sealing are most of the cost. A
$1.50-a-foot special on the wrong one is a Saturday the crew works at a
loss.

The second thing that sinks these quotes is treating the blow as the whole
job. Baffles at the eaves, foam at plumbing and wiring penetrations, a
hatch dam, and — when the existing fill is wet or the wrong product —
removal plus a dumpster are their own hour stacks. A blower paid $32 often
costs more than $41 once employer taxes, respiratory workers’ compensation,
liability, and paid time off are counted. Contractors who price off the raw
wage and “figure sealing in” are short before they start.

## How it works

1. **Per-area takeoff.** Each row is an attic section with length, width,
   existing R, and target R. Check vaulted when that section cannot take
   loose-fill — it stays in the area split but buys no bags.
2. **Bags from the R-delta.** Inches to add = (target R − existing R) ÷
   R-per-inch. Cubic feet = area × inches ÷ 12. Bags = that volume rounded
   up to the bag yield you actually buy.
3. **Blow vs air sealing.** Blow hours scale with area and added depth.
   Air sealing is penetrations × minutes. Baffles are a third stack.
4. **Removal.** Existing fill only when that scope is on — its own hours
   plus a dumpster.
5. **Travel and minimum.** Miles are a round trip. If on-site time would
   land under the minimum, the job is padded to that minimum.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Labor + bags + baffles + air-seal parts + add-ons +
   dumpster + trip + other + overhead) ÷ (1 − target margin %), because
   margin is a share of the price the homeowner sees.

It then reports the numbers a contractor sanity-checks a quote against:
bag count, inches added, price per attic square foot, effective hourly
billing rate, the share of labor that is air sealing (not blowing), the
area split, and the **walk-away price** — total cost, below which the job
makes nothing. Entering a price already on the table scores it against
the same cost base and says plainly whether it is under water. **Copy
 quote summary** turns the result into a plain-text draft. **Copy share
 link** puts the same figures in the page hash so the recipient computes
 the same profit the sender saw. The result card is also formatted for printing
 or saving as a PDF from the browser, without printing the input controls.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is an allowlist ([`share.mjs`](share.mjs)) so a
dropped field cannot silently change the quote. See the `*.test.mjs` files.

## Starting hours and material

The product types ship with common ballpark R-per-inch, bag yields, and
blow hours as a starting point. **They are not a manufacturer coverage
chart, an energy-code requirement, an IECC climate-zone table, a
benchmark, or a guarantee, and they are not a finding that any attic is
airtight, permitted, or rebate-eligible.** Real yields settle after the
blow and depend on the product, the machine, and the joist bays. Every
rate is editable, and picking a product never overwrites a figure the
contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `attic-insulation-bid-usage` — never the address,
attic sizes, R-values, wages, or prices. It is opt-out from the footer, and
it is skipped automatically when the browser sends Do Not Track or Global
Privacy Control. A share link encodes only the quote fields in the URL hash;
it is not sent to us. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `area_added`, `area_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax, permit, or rebate handling; the contractor
  enters their own numbers.
- One house, not a multi-building HOA or a dense-pack wall job.
- Starting yields are ballpark, not timed from a particular crew, product
  bag, or settling chart.
- Access issues (low pitch, knob-and-tube, moisture, vermiculite) are not
  modelled beyond the other-cost field and the removal toggle.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or
engineering advice, and it does not replace a qualified professional. It is
not a manufacturer, energy-code, rebate, or insurance inspection, and it
does not determine that any attic is airtight, permitted, or rebate-eligible.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
