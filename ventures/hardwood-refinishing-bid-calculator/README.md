# Hardwood Refinishing Bid Calculator

A free browser calculator for hardwood floor refinishers. It prices a
sand-and-finish or screen-and-recoat job from the parts a published
per-square-foot number cannot see — stair treads, closets, stain, and an extra
coat for a color change — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/hardwood-refinishing-bid-calculator -p 8080
# Run the tests
cd ventures/hardwood-refinishing-bid-calculator && node --test
```

After using this, you can now send a floor price that includes stairs, closets,
and stain, which used to take a spreadsheet rebuilt for every room count and a
guess at whether the per-square-foot special still covered the stair run.

## The problem it solves

Homeowners shop hardwood refinishing on a published price per square foot.
Rooms are what they can measure. A 400 sq ft living room of screen-and-recoat
is not the same job as 400 sq ft of hallway plus fourteen stair treads, two
closets, and a stain change. The footage is identical. Hours are not. Matching
a cheaper per-square-foot quote written for a same-color screen-and-recoat is
how a sold sand-and-stain job becomes a loss.

This is distinct from a flooring *install* calculator (LVP / hardwood / tile
waste and tear-out) and from a cabinet or interior-painting takeoff. The
takeoff here is refinishing existing hardwood: field, treads, closets, and
coats.

The second common miss is payroll burden. A $42/h finisher loaded at 30% is
$54.60. Contractors who price off the raw wage are short before the first
stair tread.

## How it works

1. **Field square footage.** The rooms the homeowner measured.
2. **Stairs and closets.** Each tread is its own hours plus a few square feet
   of tread and riser for finish gallons. Closets are cut-in time the tape
   measure of the living room never sees.
3. **Method.** Screen-and-recoat versus full sand is a hours-per-100 figure on
   the field only.
4. **Stain and extra coats.** Stain and a color-change coat follow the finish
   area — field plus treads — not a blended add-on.
5. **Loaded labor, overhead, price.** Wage × (1 + burden %). Overhead is a
   markup on direct cost. Price is cost ÷ (1 − target margin %), because margin
   is a share of the number you send.

On the sample rates the default **800 sq ft first floor with 12 treads** prices
at **$7,603.83** ($9.50 per field square foot, 75.30 crew-hours, walk-away
$5,702.87). The same house as **sand and stain** is several hundred dollars
more. Replace every rate with your invoices before you send either number.

**Copy bid summary** turns the result into a plain-text draft with the price,
the field footage, the stair count, and the gallons — wages and costs omitted
— ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `hardwood-refinishing-bid-usage` — never the square
footage, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `job_preset_applied`, `method_changed`,
`stain_changed`, `proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or permit handling.
- One house. Separate floors or a second stair run are not priced as rooms
  yet — run a second takeoff or fold them into the field and tread counts.
- Starting hours and coverage are ballpark figures, not a flooring
  specification or an adhesion warranty.
- Crew hours assume one blended labor rate, not a split between sander and
  helper.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not flooring, construction, legal, tax, or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
