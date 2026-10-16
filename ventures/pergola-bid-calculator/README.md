# Pergola Bid Calculator

A free browser calculator for deck and outdoor-living crews. It prices a
residential pergola or patio cover from the posts a square-foot special
cannot see, the shade layer, the height, and the attached ledger — and shows
the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pergola-bid-calculator/

**After using this, you can now send a pergola price that includes the posts,
shade, and height**, which used to take a spreadsheet that still started from
the coupon’s square feet.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/pergola-bid-calculator -p 8080
# Run the tests
cd ventures/pergola-bid-calculator && node --test
```

Search page: [`how-much-to-charge-to-build-a-pergola.html`](how-much-to-charge-to-build-a-pergola.html).

## The problem it solves

Small crews are shopped on a published “$45 / sf” special. That number counts
footprint square feet. It cannot see that a 10×10 open cedar frame is four
8-foot posts and no shade, while a 12×16 attached cover is a different post
count, a ledger, a shade layer, and often 10-foot posts plus a fan circuit. A
10×10 is 100 sf. A 12×16 is 192 sf. Matching the platform special is how a
sold louvered cover becomes a two-day loss after the first shade bay.

Deck *build* calculators price posts and joists as a walking platform. Paver
calculators price base and edge. Fence calculators price posts and gates as a
barrier. None of them prices a pergola.

## How it works

1. **Footprint.** Width (along the house) × depth (the projection). That is
   the number the coupon sees.
2. **Posts.** Floor(span ÷ spacing) + 1 along each side, minimum two. A
   10-foot side at 8-foot spacing is two posts; a 16-foot side is three. An
   attached job drops the house-side row for a ledger.
3. **Sticks.** Rafters spaced along the width; beams one per remaining post
   row; a ledger on the house when attached.
4. **Shade.** Open frame is zero extra. Lattice, slats, louvered, or a
   polycarbonate roof add hours and material on the whole footprint.
5. **Height.** 10- and 12-foot posts add cost and hours the 8-foot special
   never priced.
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
footprint square foot, effective hourly billing rate, the shade share of
direct cost, and the **walk-away price** — total cost, below which the job
makes nothing. Entering a price already on the table scores it against the
same cost base and says plainly whether it is under water. **Copy bid
summary** turns the result into a plain-text draft with wages omitted, ready
to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Post spacing, shade rates, hours, and material rates ship as common ballpark
figures. **They are not a building-code opinion, a permit, a warranty, or an
engineering stamp.** Real numbers depend on the species, the soil, the crew,
and the inspector. Every figure is editable, and picking a kit never
overwrites a cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `pergola-bid-usage` — never the spans, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically when
the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential-pergola model. Commercial shade structures, retractable
  awnings, and screened porches are not priced separately yet.
- Span and shade figures are starting points, not a structural check.
- No site plan, frost-depth table, or inspector checklist.

## Disclaimer

This free tool is not construction, legal, tax, financial, or engineering
advice, and it does not tell anyone what to charge or whether a layout is
compliant. Outputs are arithmetic on the user's own inputs. Verify every figure
against real payroll, insurance, and material costs and against a qualified
professional and the authority having jurisdiction before relying on it or
submitting a bid. To the maximum extent permitted by law, the authors accept no
liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
