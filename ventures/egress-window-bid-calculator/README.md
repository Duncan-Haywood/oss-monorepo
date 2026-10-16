# Egress Window Bid Calculator

A free browser calculator for foundation and basement contractors. It
prices an egress-window install the way the trade actually loses
money — retrofit on an existing hole versus a wood, masonry, or
poured-wall new cut, hopper versus slider versus casement versus
fiberglass, then well, drain, cover, ladder, dirt haul, and whether
Saturday / after-hours still covers — and shows the margin before the
price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/egress-window-bid-calculator/

**After using this, you can now** send a walk-away egress-window
price that sees the opening and the cut, **which used to take**
matching a published $1,800 installed special that treats a hopper
retrofit as the same job as a poured-wall legal bedroom.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/egress-window-bid-calculator -p 8080
# Run the tests
cd ventures/egress-window-bid-calculator && node --test
```

## The problem it solves

Owners shop contractors on a Facebook special: **$1,800 egress
window installed**. Those numbers cannot see the cut or the well.

- **Retrofit existing** swaps the sash and the well on a hole that
  already exists.
- **New-cut wood** is a header and flashing. **New-cut masonry** is
  a saw and a lintel. **New-cut poured** is a saw, a core, and a
  lintel.
- **Vinyl hopper** is the cheap special. **Slider** is the common
  legal-bedroom sash. **Casement** is a clearer opening.
  **Fiberglass** is weight.
- **Well cover, escape ladder, drain, dirt haul, and interior
  finish** are their own tickets. They do not live in an $1,800 dump.

Matching a cheap retrofit quote on a poured-wall new-cut is how a
sold legal bedroom becomes a loss when the saw and the haul eat the
margin.

This is distinct from **window replacement** (wall openings, united
inches, nailing flange), **basement finishing** (framing a rec
room), **skylight** (a roof cut), **basement waterproofing**
(interior drain, wells as a waterproofing add-on, a sump pit), and
**foundation repair** (piers). This prices an egress window.

## How it works

1. **Opening.** How many windows, plus travel miles.
2. **Scope.** Retrofit, wood cut, masonry cut, or poured cut —
   hours for the cut and the well excavation.
3. **Sash.** Hopper, slider, casement, or fiberglass — hours and
   the window invoice.
4. **Well.** Plastic, steel, or stone — hours and the well invoice.
5. **Extras.** Cover, ladder, drain, dirt haul, interior finish.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per window, effective hourly rate, the hour
split, a four-scope comparison on the same opening, a four-sash
comparison on the same opening (the casement upgrade versus the
hopper special), a **who-supplies comparison** (you buy the sash
and well versus they already bought a kit that fits versus a kit
that will not pass), a **when-you-can-work comparison** (weekday
they leave versus they stay in the basement versus Saturday /
after-hours), and the **walk-away price**. Entering a price
already on the table scores it against the same cost base — that
is the $1,800 “just cut and set what I bought” number and the
Saturday number on each access window. **Copy bid summary**
turns the result into a plain-text draft ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-install-an-egress-window.html`](how-much-to-charge-to-install-an-egress-window.html),
[`should-i-install-a-customer-supplied-egress-window.html`](should-i-install-a-customer-supplied-egress-window.html),
and [`should-i-cut-an-egress-window-on-saturday.html`](should-i-cut-an-egress-window-on-saturday.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`egress-window-bid-usage` — never the opening, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`window_changed`, `well_changed`, `proposed_price_compared`,
`owner_supply_compared`, `access_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One opening type per bid. A second bedroom is another window count,
  not a polygon of the foundation.
- Starting window, well, and cut rates are ballpark figures, not a
  catalog.
- Egress clear-opening size, well projection, and foundation
  engineering are not designed here — that is the contractor or the
  building official.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, egress-size,
foundation-design, waterproofing, legal, tax, or financial advice, and it
does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising
from its use.

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
