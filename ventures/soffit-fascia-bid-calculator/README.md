# Soffit and Fascia Bid Calculator

A free browser calculator for roofing and siding contractors. It prices
soffit and fascia the way the trade actually loses money — aluminum wrap
over existing versus a vinyl tear-off versus new wood, 1-story versus
2-story pump jacks versus 3-story scaffolding, then rot, gutter detach,
and porch beams — and shows the margin before the price goes out.

**After using this, you can now** send a walk-away soffit-and-fascia
price that sees the wrap and the replace, **which used to take** matching
a published $12 / LF wrap special that treats a 1-story ranch as the
same job as a two-story wood replace.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/soffit-fascia-bid-calculator -p 8080
# Run the tests
cd ventures/soffit-fascia-bid-calculator && node --test
```

## The problem it solves

Owners shop roofing and siding contractors on a Facebook special:
**$12 / lineal foot soffit and fascia wrap**. Those numbers cannot see
the replace or the stories.

- An **aluminum wrap over existing** on a 1-story ranch is coil and
  vinyl over wood that is still sound. There is no tear-off and no
  new boards.
- A **vinyl replace** is a different crew day. **New wood fascia and
  soffit, then wrap** is another one still.
- A **1-story** eave is an extension ladder. A **2-story** needs pump
  jacks. A **3-story or steep** needs scaffolding. The cheap special
  assumes you can reach the eave from the ground.
- **Rot, gutter detach and reset, extra corners, porch-beam wraps,
  and bird or wasp cleanup** are their own tickets. They do not live
  in a $12 dump.

Matching a cheap ranch quote on a two-story wood-replace job is how a
sold eave becomes a three-day loss after the first rotten rafter tail.

This is distinct from **gutter install** (K-style trough, miters,
drops), **gutter cleaning**, **gutter guards**, **siding** (squares of
wall), and **exterior painting** (a coat on elevations). This prices
soffit and fascia.

## How it works

1. **Eave.** Lineal feet of soffit and fascia, not square feet of house.
2. **Scope.** Wrap-over-existing, vinyl replace, or wood replace —
   hours and the coil invoice.
3. **Stories.** 1-story, 2-story pump jacks, or 3-story scaffolding.
4. **Soffit type.** Solid, vented, or hidden-vent / continuous.
5. **Extras.** Rot LF, porch beams, extra corners, gutter detach,
   pest cleanup, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per lineal foot, effective hourly rate, the hour
split, a three-scope comparison on the same eave, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-for-soffit-and-fascia.html`](how-much-to-charge-for-soffit-and-fascia.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`soffit-fascia-bid-usage` — never the eave, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`stories_changed`, `type_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One eave run. Odd returns, dormers, and wrap-around porches are extra
  lineal feet, not a polygon.
- Starting wrap, replace, and coil rates are ballpark figures, not a
  catalog.
- Ventilation design, structural rot, lead paint, and finish warranties
  are not designed here — that is the engineer or the remediator.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not roofing, siding, building-code,
ventilation, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

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
