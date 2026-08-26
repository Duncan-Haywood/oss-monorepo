# Automatic Driveway Gate Bid Calculator

A free browser calculator for gate contractors. It prices an automatic
driveway gate the way the trade actually loses money — single swing
versus dual swing versus slide, operators from leaf count, masonry
columns, vehicle loops, and solar versus AC trench — and shows the
margin before the price goes out.

**After using this, you can now** send a gate bid that names the style,
the operators, and the walk-away number, **which used to take** matching
a published $4,500 automatic-gate special and hoping the posts were
already set.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/automatic-driveway-gate-bid-calculator -p 8080
# Run the tests
cd ventures/automatic-driveway-gate-bid-calculator && node --test
```

## The problem it solves

Homeowners shop "$4,500 automatic gate" and "$350 a foot." Those numbers
cannot see the style. A 12-foot single aluminum swing on existing posts
at the sample rates is about $6,506. The same shop's 16-foot dual steel
swing with masonry columns, two loops, a keypad, and a solar kit is
about $20,440 — and almost half of that is columns, loops, power, and
access. Matching the kit special on the dual masonry job is how a sold
gate becomes a two-day loss after the first loop sawcut.

This is not a *fence* tool (posts, panels, and walk gates as a barrier)
and not a *garage-door* tool (torsion springs and a header). It prices
the *motorized driveway operator*, UL 325 safety, access, and the
columns that hold the leaves.

## How it works

1. **Operators.** Single swing and slide are one operator. Dual swing is
   two. The Facebook special is almost always one residential swing kit.
2. **Leaves.** Opening width × leaf dollars × a material weight factor.
   Steel and wood hang heavier than aluminum or chain-link.
3. **Columns.** Existing posts are zero new columns. Steel posts and
   masonry are two for single/slide and three for dual (two hinges plus
   a catch).
4. **Power, loops, access.** AC trenches conduit. Solar is a kit.
   Vehicle loops, keypad, battery backup, and edge sensors are their
   own hours and tickets.
5. **Loaded labor.** Hourly wage × (1 + payroll burden %).
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
opening foot, operator count, effective hourly rate, extra-work share, a
three-style comparison on the same opening, and the **walk-away price**.
Entering a price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft ready to paste
into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

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
in `localStorage` under `automatic-driveway-gate-bid-usage` — never the
opening, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `style_changed`,
`proposed_price_compared`, `summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- Starting hours and kit rates are ballpark figures, not a catalog,
  a UL 325 determination, or an electrical design.
- Soil, slope, leaf weight versus operator class, and what the
  jurisdiction will accept still decide the style. The comparison is
  arithmetic, not a recommendation.
- Intercom, mag lock, traffic control, and utility conflicts are not
  modelled as their own rows yet — fold them into site hours or travel.

## Disclaimer

This free tool is not gate, construction, electrical, legal, tax, or
financial advice, and it does not tell anyone what to charge. Outputs
are arithmetic on the user's own inputs. Verify every figure against
real payroll, insurance, operator, leaf, column, loop, and permit costs
and against a qualified professional before relying on it or submitting
a bid. To the maximum extent permitted by law, the authors accept no
liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
