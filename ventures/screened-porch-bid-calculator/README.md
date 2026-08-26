# Screened Porch Bid Calculator

A free browser calculator for porch, lanai, and screen-enclosure crews. It
prices a residential screened porch from the wall-screen square feet a
floor-square-foot special cannot see, the knee wall, the roof, the ceiling,
and the mesh — and shows the margin before the price goes out.

**After using this, you can now send a screened-porch price that includes the
panels, knee wall, and roof**, which used to take a spreadsheet that still
started from the coupon’s floor square feet.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/screened-porch-bid-calculator -p 8080
# Run the tests
cd ventures/screened-porch-bid-calculator && node --test
```

Search page: [`how-much-to-charge-to-screen-a-porch.html`](how-much-to-charge-to-screen-a-porch.html).

## The problem it solves

Small crews are shopped on a published “$55 / sf” special. That number counts
floor square feet. It cannot see that a 10×12 screen-in under an existing roof
is 32 lineal feet of wall and 256 square feet of screen on a 120 sf floor,
while a 12×16 enclosed porch is a different panel count, a 36-inch knee wall,
a new roof, and often a ceiling plus pet mesh. A 10×12 is 120 sf. A 12×16 is
192 sf. Matching the floor special is how a sold enclosed porch becomes a
two-day loss after the first wall of panels.

Deck *build* calculators price posts and joists as a walking platform. Pergola
calculators price an open shade layer. Fence calculators price posts and gates
as a barrier. None of them prices a screened porch.

## How it works

1. **Floor.** Width (along the house) × depth (the projection). That is the
   number the coupon sees.
2. **Screenable wall.** Three sides if attached; four if it wraps. Wall-screen
   square feet is that perimeter times the screen height after the knee wall.
3. **Panels.** Ceiling of perimeter ÷ panel width. A 32-foot attached porch at
   36-inch centers is 11 panels, not “120 square feet.”
4. **Knee wall, roof, ceiling.** Full-height screen is zero knee wall. A new
   framed roof or a screen roof covers the whole floor. Vinyl or beadboard
   does the same.
5. **Mesh.** Fiberglass is the coupon. Pet-resistant and hurricane / solar
   mesh add hours and material the special never priced.
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
floor square foot, effective hourly billing rate, the screen share of direct
cost, and the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the same cost
base and says plainly whether it is under water. **Copy bid summary** turns the
result into a plain-text draft with wages omitted, ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Panel widths, mesh rates, hours, and material rates ship as common ballpark
figures. **They are not a building-code opinion, a permit, a warranty, or an
engineering stamp.** Real numbers depend on the frame, the mesh, the crew, and
the inspector. Every figure is editable, and picking a kit never overwrites a
cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `screened-porch-bid-usage` — never the spans, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential screened-porch model. Commercial storefronts, retractable
  screens, and full pool-cage engineering packages are not priced separately
  yet.
- Panel and mesh figures are starting points, not a structural check.
- No site plan, wind-load table, or inspector checklist.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
