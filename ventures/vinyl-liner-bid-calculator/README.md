# Vinyl Liner Bid Calculator

A free browser calculator for vinyl-liner pool crews. It prices a residential
liner replacement from the liner square feet a water-surface special cannot
see, the hopper, the stairs, the bead, and the track — and shows the margin
before the price goes out.

**After using this, you can now send a vinyl-liner price that includes the
walls, hopper, and stairs**, which used to take a spreadsheet that still
started from the coupon’s water surface.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/vinyl-liner-bid-calculator -p 8080
# Run the tests
cd ventures/vinyl-liner-bid-calculator && node --test
```

Search page: [`how-much-to-charge-to-replace-a-pool-liner.html`](how-much-to-charge-to-replace-a-pool-liner.html).

## The problem it solves

Small crews are shopped on a published “$2,999 for a 16×32” or “$8 / sf of
water” special. That number counts water surface. It cannot see that a 16×32
rectangle is 96 lineal feet of wall and about 961 square feet of liner on a
512 sf floor, while an 18×36 oval with a hopper, wedding-cake stairs, and a
patterned 27-mil sheet is a different order, a different stretch, and often a
new bead track. Matching the water-surface special is how a sold hopper oval
becomes a two-day loss after the first wrinkle in the deep end.

Pool *plaster* calculators price chip-out and a new cementitious finish on
gunite. Hot-tub calculators price a crane, a pad, and a circuit. Weekly pool
*route* tools price chemicals. None of them prices a vinyl liner.

## How it works

1. **Water surface.** Length × width on a rectangle, the ellipse on an oval,
   85% of the bounding box on a kidney. That is the number the coupon sees.
2. **Wall vinyl.** Perimeter × wall height (usually 42 inches). A 16×32 is
   336 sf of wall the coupon never counted.
3. **Hopper extra.** A hopper box adds a share of the floor. Spoon is a
   gentle slope. Flat is walls only.
4. **Stairs.** Hop-out or wedding-cake stairs add vinyl and wrinkle time.
5. **Order.** Liner square feet × (1 + waste). Patterned prints waste more
   because the match has to land on the bead.
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
water square foot, price per liner square foot, effective hourly billing rate,
the liner share of direct cost, and the **walk-away price** — total cost,
below which the job makes nothing. Entering a price already on the table
scores it against the same cost base and says plainly whether it is under
water. **Copy bid summary** turns the result into a plain-text draft with
wages omitted, ready to paste into a proposal. **Copy share link** encodes the
whole takeoff — shape, depth, mil, bead, stairs, pattern, access, every span,
every rate, and the deposit/terms from the proposal panel — into a URL
fragment a crew can send to an office manager, a second crew lead, or the
customer; nothing is uploaded, and opening the link reopens the same bid
instead of the form's defaults. See [`share.mjs`](share.mjs).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Mil rates, waste percents, hours, and material rates ship as common ballpark
figures. **They are not a building-code opinion, a permit, a warranty, or an
engineering stamp.** Real numbers depend on the bead receiver, the mill, the
crew, and the inspector. Every figure is editable, and picking a kit never
overwrites a cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `vinyl-liner-bid-usage` — never the spans, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`, `share_link_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential vinyl-liner model. Commercial parks, vinyl-over-concrete
  conversions, and full equipment packages are not priced separately yet.
- Mil and waste figures are starting points, not a mill quote.
- No site plan, structural check, or inspector checklist.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
