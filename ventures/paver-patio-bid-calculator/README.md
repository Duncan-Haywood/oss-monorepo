# Paver Patio Bid Calculator

A free browser calculator for hardscape contractors. It prices an interlocking
paver patio from the parts a published per-square-foot number cannot see —
pattern waste, compacted-base cubic yards, edge restraint, and spoil haul-away
— and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/paver-patio-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/paver-patio-bid-calculator -p 8080
# Run the tests
cd ventures/paver-patio-bid-calculator && node --test
```

After using this, you can now send a patio price that includes waste, base,
edge, and haul-away, which used to take a spreadsheet rebuilt for every pattern
and a guess at whether the per-foot special still covered the dump tickets.

## The problem it solves

Homeowners shop paver work on a published price per square foot of patio.
Length × width is what they can measure. A 12 × 16 running-bond sitting area on
six inches of base is not the same job as 12 × 16 of 45° herringbone on a
ten-inch driveway pad. The face is identical. Excavation volume, extra pavers,
cut hours, and dump tickets are not. Matching a cheaper per-foot quote written
for a simple patio is how a sold job becomes a loss.

This is distinct from a concrete slab calculator (cubic yards of mix and
finishing), a retaining-wall calculator (height, geogrid, and drainage), and a
deck calculator (elevation, rail, and stairs). The takeoff here is a paved
face plus the hole under it.

The second common miss is payroll burden. A $32/h crew loaded at 30% is $41.60.
Contractors who price off the raw wage are short before the first pallet lands.

## How it works

1. **Finished face.** Length × width, or an area you already measured.
2. **Pattern waste.** Extra pavers bought for the cut list. Running bond starts
   around 7%, 45° herringbone around 15%. Waste is material only.
3. **Pattern labor.** A separate factor on install hours for the extra cuts.
4. **The hole.** Excavation depth = base + bedding + paver thickness. Compacted
   base and bedding sand are priced by the cubic yard.
5. **Edge restraint.** Lineal feet — the perimeter, or a longer number if you
   have soldier courses and radii. A walkway has more edge per square foot than
   a patio.
6. **Haul-away.** The same excavation volume, if spoils cannot stay on site.
7. **Loaded labor, overhead, price.** Wage × (1 + burden %). Overhead is a
   markup on direct cost. Price is cost ÷ (1 − target margin %), because margin
   is a share of the number you send.

On the sample rates the default **12 × 16 running-bond patio** prices at
**$4,381.10** ($22.82 per finished square foot, 20.9 crew-hours, walk-away
$3,417.26). The same face as **45° herringbone on a 10-inch base** prices at
**$5,151.18** ($26.83 per foot). Replace every rate with your invoices before
you send either number.

**Copy bid summary** turns the result into a plain-text draft with the price,
the face, the excavation, and the edge — wages and costs omitted — ready to
paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `paver-patio-bid-usage` — never the patio, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `job_preset_applied`, `pattern_changed`,
`use_changed`, `haul_changed`, `proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or permit handling.
- One rectangular face. Multiple beds, seat walls, steps, and fire-pit
  cutouts are not priced as separate objects yet — fold them into edge
  footage and waste, or run a second takeoff.
- Starting waste and base depths are ballpark figures, not a compaction spec
  or an engineered pavement design.
- Crew hours assume one blended labor rate, not a split between machine
  operator and installers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, construction, legal, tax, or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
