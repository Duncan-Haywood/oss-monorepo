# French Drain Bid Calculator

A free browser calculator for drainage and excavation contractors. It
prices an exterior French-drain install the way the trade actually
loses money — trench depth, pipe size, clay versus dirt, daylight
versus a drywell, catch basins, downspout ties, and a driveway
crossing as their own hours — and shows the margin before the price
goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/french-drain-bid-calculator -p 8080
# Run the tests
cd ventures/french-drain-bid-calculator && node --test
```

## The problem it solves

Small drainage shops are told to bid by a published "$25 a foot
installed" special, or by a "$40 a linear foot" coupon. That rule
cannot see the trench. A 40-foot shallow 4-inch daylight run in dirt
is not the same job as an 80-foot deep 6-inch clay run that has to
hit a drywell, two catch basins, three downspout ties, and a
driveway crossing. The trip is the same. The hours are not. Matching
a cheaper special written for the brochure trench is how a sold clay
drywell job becomes a two-day loss after the first rock ledge and
the first saw-cut.

Basement-waterproofing calculators price interior perimeter drain,
window wells, and a sump pit. Gutter-install calculators price
K-style, miters, and fascia. Neither prices an exterior yard drain.

After using this, you can now send a French-drain price that already
includes the trench and the extras, which used to take a guess from a
published per-foot special.

## How it works

1. **Depth, pipe, and soil.** A shallow 4-inch daylight trench in
   dirt is not a deep 6-inch run in clay and is not a rock ledge.
2. **Outlet as its own hours.** Daylight to grade is not a drywell
   and is not a permitted storm tap. Zero drywell hours still
   prices — outlet hours drop, depth does not disappear.
3. **Basins, downspouts, driveway, extra solid pipe, and lawn as
   their own hours.** A brochure special is not a drainage package.
   Depth and clay are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against:
price per foot, effective hourly billing rate, the hour split, and the
**walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost
base. **Copy bid summary** turns the result into a plain-text draft
with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, depth, pipe, soil, and outlet presets ship with common
ballpark hours and material figures. **They are not an industry
standard or a drainage design.** Changing depth, pipe, soil, or
outlet never overwrites a rate the contractor has already changed.

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
in `localStorage` under `french-drain-bid-usage` — never the yard, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One run / one trip. A whole-yard system, a municipal storm tap
  that needs engineered drawings, or a pumped discharge is not
  priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price interior basement waterproofing or gutter install.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
