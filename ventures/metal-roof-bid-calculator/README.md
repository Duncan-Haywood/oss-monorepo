# Metal Roof Bid Calculator

A free browser calculator for standing-seam and exposed-fastener metal-roofing
crews. It prices a residential metal roof from the panel squares a per-square
special cannot see, the tear-off, the stories, and the trim — and shows the
margin before the price goes out.

**After using this, you can now send a metal-roof price that includes the
panel type, the tear-off, and the trim**, which used to take a spreadsheet
that still started from the coupon’s roof squares.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/metal-roof-bid-calculator -p 8080
# Run the tests
cd ventures/metal-roof-bid-calculator && node --test
```

Search page: [`how-much-to-charge-for-a-metal-roof.html`](how-much-to-charge-for-a-metal-roof.html).

## The problem it solves

Small crews are shopped on a published “$950 / square” special. That number
counts roof squares after pitch. It cannot see that a 40×30 ranch at 4/12 is
12.65 squares of 5V overlay, while a 50×40 two-story at 10/12 is 26.04 squares
of mechanical-lock standing seam, a full tear-off, valleys, and snow guards. A
ranch overlay is 12.65 squares. A 10/12 colonial is 26.04 squares. Matching the
square special is how a sold standing-seam tear-off becomes a week of unpaid
seamer time after the first valley.

Asphalt-shingle reroof calculators price bundles and tear-off bags. Solar
calculators price dollars per watt on a roof that is already there. Gutter
install calculators price K-style and miters. None of them prices a metal roof.

## How it works

1. **Plan.** Length × width of the building. That is the number a plan-square
   coupon sees.
2. **Pitch.** A 4/12 multiplies the plan by 1.054; a 12/12 multiplies it by
   1.414. Roof squares are that area ÷ 100.
3. **Panel squares.** Kit waste plus extra waste from hips and valleys. A
   12.65-square ranch at 8% waste is 13.66 panel squares, not “12 squares.”
4. **Tear-off and stories.** Overlay is zero tear-off. A full tear-off covers
   the roof, not the panel waste. Two stories add hours the ranch special never
   priced.
5. **Trim.** Ridge, hip, valley, rake, and eave lineal feet. Snow guards and
   pipe boots are counted, not guessed as “misc.”
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
square, effective hourly billing rate, the panel share of direct cost, and the
**walk-away price** — total cost, below which the job makes nothing. Entering a
price already on the table scores it against the same cost base and says
plainly whether it is under water. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Pitch multipliers, waste, hours, and material rates ship as common ballpark
figures. **They are not a building-code opinion, a permit, a warranty, or an
engineering stamp.** Real numbers depend on the panel, the deck, the crew, and
the inspector. Every figure is editable, and picking a kit never overwrites a
cost the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `metal-roof-bid-usage` — never the squares, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One residential metal-roof model. Commercial standing-seam, stone-coated
  steel, and copper are not priced separately yet.
- Pitch and waste figures are starting points, not a structural or wind-uplift
  check.
- No load table, flashing schedule, or inspector checklist.

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
The numbers ride in the URL **fragment**, after the `#`, which browsers never
send to a server — so copying or opening one uploads nothing, and nothing lands
in a host's access log. Anyone holding the link can read them, though: send it
to yourself or your crew. The customer should get the price, not the link.

Nothing is uploaded either way. The link is built in the browser and copied by
you; the save is `localStorage` on your own device.

`share.mjs` is the pure encode/decode/store module and is identical in every
bid calculator here. Its field list is passed in from the page rather than kept
in the module, so a field added to the form is saved and shareable without
touching it; `page.test.mjs` fails if the two ever drift apart.
