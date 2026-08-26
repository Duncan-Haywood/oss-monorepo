# Flat Roof Bid Calculator

A free browser calculator for TPO, EPDM, PVC, and modified-bitumen crews. It
prices a low-slope roof from the membrane squares a per-square special cannot
see, the tear-off, the insulation, the parapet, and the drains — and shows the
margin before the price goes out.

**After using this, you can now send a flat-roof price that includes the
membrane, the tear-off, and the insulation**, which used to take a spreadsheet
that still started from the coupon’s plan squares.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/flat-roof-bid-calculator -p 8080
# Run the tests
cd ventures/flat-roof-bid-calculator && node --test
```

Search page: [`how-much-to-charge-for-a-flat-roof.html`](how-much-to-charge-for-a-flat-roof.html).

## The problem it solves

Small crews are shopped on a published “$650 / square” special. That number
counts plan squares. It cannot see that a 40×30 garage is 12 squares of TPO-45
recover, while an 80×50 two-story commercial deck is 40.04 squares of 80-mil
TPO, a wet-insulation tear-off, two polyiso layers, 80 lf of parapet, and six
drains. Matching the square special is how a sold commercial tear-off becomes
unpaid welding time after the first parapet.

Asphalt-shingle reroof calculators price bundles and pitch. Metal-roof
calculators price standing-seam panels and trim. Solar calculators price
dollars per watt on a roof that is already there. None of them prices a
low-slope membrane roof.

## How it works

1. **Plan.** Length × width of the building. That is the number a plan-square
   coupon sees.
2. **Slope.** A 1/4" per foot barely changes the area. A 1" per foot multiplies
   the plan by 1.003. Roof squares are that area ÷ 100.
3. **Membrane squares.** Kit waste plus extra waste from parapet flashing. A
   12-square garage at 8% waste is 12.96 membrane squares, not “12 squares.”
4. **Tear-off and insulation.** Recover is zero tear-off. A full tear-off
   covers the roof. Wet insulation is a second layer of dumpster the recover
   never priced. Each polyiso layer covers the roof, not the membrane waste.
5. **Field extras.** Parapet lineal feet, roof drains, HVAC curbs, walk pads,
   and cover board. These are counted, not guessed as “misc.”
6. **Price.** Loaded wage × hours, plus materials and mobilization, plus
   overhead on that direct cost, then cost ÷ (1 − target margin %). Margin is a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price per
square, effective hourly billing rate, the membrane share of direct cost, and
the **walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost base and
says plainly whether it is under water. **Copy bid summary** turns the result
into a plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting figures

Membrane rates, waste, hours, and insulation figures ship as common ballpark
figures. **They are not a building-code opinion, a permit, a wind-uplift
rating, a warranty, or an engineering stamp.** Real numbers depend on the
membrane, the deck, the crew, and the inspector. Every figure is editable, and
picking a kit never overwrites a cost the contractor has already changed.

## Come back to a bid

**Copy link to this bid** puts every number you entered into the URL after the
`#`, and reopening that link restores them. It is how you get back to a bid
tomorrow, and how you hand one to whoever prices with you.

Browsers never send a fragment to a server &mdash; not in the request, not in
the `Referer` header a click through to another site would carry &mdash; so the
link keeps the same promise as the rest of the page: nothing you typed is
uploaded. Anyone holding the link can read the numbers in it, so treat it like
the bid itself.

Nothing is written to the link that is not on the page. The snapshot is taken
from the form itself rather than from a list of field names, so a field added
to this calculator later travels the day it ships &mdash; a field silently
missing from a link is a wrong price for the recipient, not an error message.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `flat-roof-bid-usage` — never the squares, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One low-slope model. Built-up roofing, spray foam, and green-roof assemblies
  are not priced separately yet.
- Membrane and waste figures are starting points, not a wind-uplift or
  FM-approval check.
- No flashing schedule or inspector checklist.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
