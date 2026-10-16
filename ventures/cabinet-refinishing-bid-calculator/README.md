# Cabinet Refinishing Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cabinet-refinishing-bid-calculator/>

A free browser calculator for cabinet painters. It prices a kitchen refinish
from the parts a published per-door number cannot see — drawer fronts,
face-frame openings, hardware remove-and-rehang, degrease, and a dark-to-light
extra coat — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/cabinet-refinishing-bid-calculator -p 8080
# Run the tests
cd ventures/cabinet-refinishing-bid-calculator && node --test
```

After using this, you can now send a kitchen price that includes drawers,
frames, hardware, and degrease, which used to take a spreadsheet rebuilt for
every door count and a guess at whether the per-door special still covered the
extra coat.

## The problem it solves

Homeowners shop cabinet painting on a published price per door. Doors are what
they can count. A 10-door galley with eight drawer fronts, a greasy range wall,
and a dark-to-light extra coat is not the same job as ten shop-sprayed doors
with the existing pulls left on. The door count is identical. Hours are not.
Matching a cheaper per-door quote written for a clean laundry-room cabinet is
how a sold kitchen becomes a loss.

This is distinct from an interior-painting calculator (walls and ceilings by
the square foot) and from a flooring or drywall takeoff. The takeoff here is
millwork: removable pieces, boxes that stay on the wall, and every hinge.

The second common miss is payroll burden. A $38/h finisher loaded at 30% is
$49.40. Contractors who price off the raw wage are short before the first door
comes off.

## How it works

1. **Piece count.** Doors, drawer fronts, and face-frame openings. A per-door
   special only sees the first number.
2. **Hardware.** Hinges and pulls are remove, bag, and rehang hours. New
   hardware is material, not invented time.
3. **Finish method.** Shop spray, on-site spray, and brush are a labor factor
   on the painted pieces only.
4. **Color change.** Dark-to-light is an extra coat on removable pieces.
5. **Degrease.** Grease on a cooking wall is hours before primer will stick.
6. **Loaded labor, overhead, price.** Wage × (1 + burden %). Overhead is a
   markup on direct cost. Price is cost ÷ (1 − target margin %), because margin
   is a share of the number you send.

On the sample rates the default **10-door / 8-drawer galley** prices at
**$3,389.95** ($339.00 per door, $125.55 per painted piece, 32.77 crew-hours,
walk-away $2,542.46). The same kitchen as **on-site brush** prices at
**$4,446.05**. Replace every rate with your invoices before you send either
number.

**Copy bid summary** turns the result into a plain-text draft with the price,
the piece count, and the gallons — wages and costs omitted — ready to paste
into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `cabinet-refinishing-bid-usage` — never the piece
counts, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `job_preset_applied`, `finish_changed`,
`color_changed`, `hardware_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or permit handling.
- One kitchen. Islands, vanities, and office built-ins are not priced as
  separate rooms yet — run a second takeoff or fold them into the piece
  counts.
- Starting hours and coverage are ballpark figures, not a paint specification
  or an adhesion warranty.
- Crew hours assume one blended labor rate, not a split between sprayer and
  helper.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not painting, construction, legal, tax, or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
