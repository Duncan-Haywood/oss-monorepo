# Retaining Wall Bid Calculator

A free browser calculator for hardscape and landscape contractors. It prices
a retaining wall the way the trade actually loses money — face area, then a
wall-type and height factor, then drain stone, geogrid, corners, and the
engineer/permit step a per-linear-foot quote cannot see — and shows the
margin before the price goes out.

**After using this, you can now price a 40 ft, 6 ft engineered wall with
geogrid and an engineer stamp as a different job from a 40 ft, 3 ft garden
wall of the same length**, which used to take a spreadsheet that still
started from "$120 a foot" and hid the extras.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/retaining-wall-bid-calculator -p 8080
# Run the tests
cd ventures/retaining-wall-bid-calculator && node --test
```

## The problem it solves

Homeowners shop retaining walls as a price per linear foot. Length is what
they can see. Height cubes material and labor. Drain-stone volume, geogrid
layers, and often an engineer stamp do not scale with length. A 40 ft, 6 ft
engineered wall is not "the same wall, just taller" than a 40 ft, 3 ft garden
wall — it is more face, more stone, reinforcement, and a fee that does not
shrink because the wall is short. Matching a cheaper per-foot quote written
for the garden wall is how a sold job becomes a loss.

The second thing that sinks these bids is payroll burden. A crew paid $38
costs more like $49 once employer taxes, workers' compensation, liability
insurance, and paid time off are counted. Pricing off the raw wage is short
before the first course is set.

## How it works

1. **Face area.** Length × (exposed height + embedment). Not length alone.
2. **Face labor.** Face sq ft × hours per sq ft on easy access × wall-type
   factor (segmental, timber, poured, boulder) × height factor.
3. **Drainage.** Drain-stone cubic yards from length × total height × depth,
   plus a perforated pipe along the length.
4. **Geogrid.** Layers × depth into the retained soil, as square yards. A
   helper suggests 0 under 4 ft, 1 at 4 ft, then another layer every 2 ft —
   a starting count, not a design.
5. **Corners.** Hours that do not scale with length.
6. **Engineer and permit.** A step many jurisdictions treat as appearing
   near 4 ft exposed, not a dollar per foot.
7. **Loaded labor.** Hourly wage × (1 + payroll burden %).
8. **Price.** Direct cost plus overhead, then ÷ (1 − target margin %),
   because margin is quoted as a share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price
per linear foot, dollars per face sq ft, effective hourly billing rate, the
cost split, and the **walk-away price** — total cost, below which the job
makes nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the customer-facing side into a
plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

A short answer to the search query lives in
[`how-much-to-charge-for-a-retaining-wall.html`](how-much-to-charge-for-a-retaining-wall.html).

## Starting rates

Wall-type factors, height factors, and extras ship with common ballpark
figures. **They are not an industry standard, a benchmark, an engineered
design, or a guarantee.** Real hours depend on the crew, the soil, access,
and the manufacturer. Every rate is editable, and picking a preset never
overwrites a number the contractor has already changed.

This tool is **not** a fence bid, a concrete slab / driveway bid, a deck
bid, or an irrigation bid. It prices a stacked or formed retaining face
plus the drainage and reinforcement that face actually requires.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `retaining-wall-bid-usage` — never the wall size,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `wall_preset_applied`, `wall_type_changed`,
`height_changed`, `engineer_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or HOA-deposit handling. Those are the
  customer's or the accountant's — this prices the install.
- One wall as a single job. Terraces can be run as separate bids; they are
  not drawn as a site plan.
- No soils report, manufacturer table, or engineered design. Output is
  arithmetic.
- Starting factors are ballpark, not timed from a specific crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or soils advice, and it does not replace a qualified professional. It is
not an engineered wall design, a permit approval, or a geotechnical
determination. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

Free support is optional and never required:
[the project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects).
