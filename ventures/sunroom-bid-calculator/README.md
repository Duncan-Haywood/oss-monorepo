# Sunroom Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sunroom-bid-calculator/>

A free browser calculator for sunroom, three-season, and four-season crews. It
prices a residential sunroom from the glazed-wall square feet a
floor-square-foot special cannot see, the thermal floor, the insulated roof,
and HVAC — and shows the margin before the price goes out.

**After using this, you can now send a sunroom price that includes the glass,
the slab, and the roof**, which used to take a spreadsheet that still started
from the coupon’s floor square feet.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/sunroom-bid-calculator -p 8080
# Run the tests
cd ventures/sunroom-bid-calculator && node --test
```

Search page: [`how-much-to-charge-to-build-a-sunroom.html`](how-much-to-charge-to-build-a-sunroom.html).

## The problem it solves

Small crews are shopped on a published “$180 / sf” special. That number counts
floor square feet. It cannot see that a 10×12 three-season on an existing deck
is 32 lineal feet of wall and 256 square feet of vinyl glass on a 120 sf floor,
while a 12×16 four-season is a different window count, insulated glass, a new
slab, an insulated roof, and often a mini-split. A 10×12 is 120 sf. A 12×16 is
192 sf. Matching the floor special is how a sold four-season room becomes a
two-week loss after the first wall of glass.

Screened-porch calculators price mesh panels. Deck *build* calculators price
posts and joists as a walking platform. Pergola calculators price an open shade
layer. None of them prices a sunroom.

## How it works

1. **Floor.** Width (along the house) × depth (the projection). That is the
   number the coupon sees.
2. **Glazed wall.** Three sides if attached; four if it wraps. Glass square
   feet is that perimeter times the glass height after the knee wall.
3. **Windows.** Ceiling of perimeter ÷ window width. A 32-foot attached sunroom
   at 48-inch centers is 8 windows, not “120 square feet.”
4. **Floor and roof.** An existing deck is an insulated overlay. A new slab is
   a pour. A new insulated roof covers the whole floor. An existing roof is
   zero — the walls are the job.
5. **Enclosure.** Three-season vinyl is the coupon. Four-season insulated
   glass adds hours and material the special never priced.
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
floor square foot, effective hourly billing rate, the glass share of direct
cost, and the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the same cost
base and says plainly whether it is under water. **Copy bid summary** turns the
result into a plain-text draft with wages omitted, ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Window widths, glass rates, hours, and material rates ship as common ballpark
figures. **They are not a building-code opinion, a permit, a warranty, or an
engineering stamp.** Real numbers depend on the glass, the slab, the crew, and
the inspector. Every figure is editable, and picking a kit never overwrites a
cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `sunroom-bid-usage` — never the spans, wages, costs, or
prices. It is opt-out from the footer, and it is skipped automatically when the
browser sends Do Not Track or Global Privacy Control. See [`usage.mjs`](usage.mjs)
and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential sunroom model. Conservatories, commercial storefronts, and
  engineered glass-wall packages are not priced separately yet.
- Window and glass figures are starting points, not a structural or energy-code
  check.
- No site plan, load table, or inspector checklist.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

## Saving and sharing a bid

The whole form is kept in your own browser as you type, so the bid is still
there on the next visit — the rates you tuned, not the ballpark ones this ships
with. **Start a fresh bid** deletes it.

**Copy bid link** puts the same bid in a URL. Opening it reproduces the bid
exactly, in any browser, with nothing stored server-side — there is no server.
A link beats a saved bid when both exist, because someone opening a link meant
to see that bid; the page says which one is on screen.

A bid link carries your own rates — wage, burden, overhead, and target margin.
Send it to yourself or your crew. The customer should get the price, not the
link.

Nothing is uploaded either way. The rates ride in the link's `#` fragment,
which browsers never send to a server or put in a `Referer` header, so opening
or forwarding a bid link does not leak the numbers off the machines you send it
to. The link is built in the browser and copied by you; the save is
`localStorage` on your own device.

`share.mjs` is the pure encode/decode/store module and is identical in every
bid calculator here. Its field list is passed in from the page rather than kept
in the module, so a field added to the form is saved and shareable without
touching it; `page.test.mjs` fails if the two ever drift apart.
