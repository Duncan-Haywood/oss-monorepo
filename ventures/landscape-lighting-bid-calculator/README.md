# Landscape Lighting Bid Calculator

A free browser calculator for landscape lighting contractors. It prices
low-voltage outdoor lighting the way the trade actually loses money —
fixtures-only on an existing transformer versus a new system with trench
and a transformer versus an add-on home-run, easy lawn versus irrigated
turf versus rocky soil, then well lights, a photocell, and a driveway
saw-cut — and shows the margin before the price goes out.

**After using this, you can now** send a walk-away landscape-lighting
price that sees the fixtures and the trench, **which used to take**
matching a published $150 / light special that treats six path lights
as the same job as an 18-fixture architectural install.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/landscape-lighting-bid-calculator -p 8080
# Run the tests
cd ventures/landscape-lighting-bid-calculator && node --test
```

## The problem it solves

Owners shop landscape lighting contractors on a Facebook special:
**$150 a light installed**. Those numbers cannot see the trench or
the transformer.

- **Fixtures-only** hangs lights on a transformer and wire that are
  already there. There is no trench and no new transformer.
- A **new system** is trench, low-voltage wire, and a transformer.
  An **add-on** is a home-run back to what is already on the house.
- A **path light** is a stake. An **uplight** is aim. A **well light**
  is a dig and a drain. **Hardscape / step lights** are fasteners on
  stone. The cheap special assumes every fixture is a path light.
- **Irrigated turf, rocky soil, a photocell, a driveway saw-cut, and
  a second transformer** are their own tickets. They do not live in
  a $150 dump.

Matching a cheap walkway quote on a new-system architectural job is
how a sold lighting job becomes a loss when the home-run and the well
lights eat the margin.

This is distinct from **holiday lights** (seasonal C9 hang / take-down),
**electrical panel** (service amps), **irrigation install** (water zones
and a backflow), **pergola** (open shade), and **exterior painting**
(a coat). This prices landscape lighting.

## How it works

1. **Fixtures.** Path, uplight, well, and hardscape counts — not a
   blended “number of lights.”
2. **Scope.** Fixtures-only, new-system, or existing-add-on — hours
   and the transformer invoice.
3. **Soil.** Easy lawn, irrigated turf repair, or rocky / rooted.
4. **Transformer.** Existing, 150W, 300W, or dual-tap 600W.
5. **Extras.** Photocell, driveway saw-cut, extra transformer, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per fixture, effective hourly rate, the hour
split, a three-scope comparison on the same yard, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-landscape-lighting.html`](how-much-to-charge-to-install-landscape-lighting.html).

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

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`landscape-lighting-bid-usage` — never the fixtures, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`soil_changed`, `transformer_changed`, `proposed_price_compared`,
`summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One trench run. Odd returns, under-driveway bores, and split
  home-runs are extra lineal feet, not a polygon.
- Starting fixture, trench, and transformer rates are ballpark
  figures, not a catalog.
- Electrical design, voltage-drop, load calculations, and product
  warranties are not designed here — that is the electrician or the
  manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not electrical, lighting-design,
building-code, legal, tax, or financial advice, and it does not replace a
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
