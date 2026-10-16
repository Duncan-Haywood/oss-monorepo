# Walk-In Tub Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/walk-in-tub-bid-calculator/>

A free browser calculator for bath remodelers and accessibility
contractors. It prices a walk-in tub install the way the trade
actually loses money — alcove swap versus drain relocate versus
new construction versus a custom opening, acrylic soaker versus
cast versus whirlpool versus air-jet versus extra-wide, then
door, tile, grab bars, and floor work — and shows the margin
before the price goes out.

**After using this, you can now** send a walk-away walk-in-tub
price that sees the alcove, the unit, whether they already
bought the tub, and whether Saturday still pays after overtime,
**which used to take** matching a published $3,499 installed
special — or a $1,499 “just set what I bought” special — that
treats a weekday soaker alcove swap as the same job as a
Saturday whirlpool after a fall.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/walk-in-tub-bid-calculator -p 8080
# Run the tests
cd ventures/walk-in-tub-bid-calculator && node --test
```

## The problem it solves

Owners shop contractors on a Facebook special: **$3,499 walk-in
tub installed**. Those numbers cannot see the alcove or the unit.

- **Alcove swap** pulls the existing tub and sets the new one on
  the same drain.
- **Alcove relocate** moves the drain or the supply. **New
  construction** has no demo. **Custom opening** widens the
  alcove or converts a shower.
- **Acrylic soaker** is the cheap special. **Cast** is weight.
  **Whirlpool** is a pump and a GFCI. **Air-jet** is a blower.
  **Extra-wide** is handling.
- **Cast-iron demo, tile surround, grab bars, handheld, floor
  sistering, and a permit** are their own tickets. They do not
  live in a $3,499 dump.

Matching a cheap alcove-swap quote on a relocate-plus-tile job
is how a sold aging-in-place install becomes a loss when the
plumbing and the surround eat the margin.

Families also call after a fall: **can you start Saturday so
she is not climbing the old tub?** A weekday $3,499 number is
not a Saturday bid. Occupied is the same wage on a slower set.
After-hours is time-and-a-half plus a second evening trip —
you cannot leave the alcove open overnight in the only bath.

This is distinct from a **walk-in shower** (tile, slope, glass),
a **hot tub** (outdoor crane and a pad), **toilet replacement**
(a commode swap), and a **water heater** (a tank). This prices a
walk-in tub.

## How it works

1. **Bath.** How many tubs, plus travel miles.
2. **Scope.** Alcove swap, relocate, new construction, or custom
   opening — hours for the demo and the set.
3. **Unit.** Soaker, cast, whirlpool, air-jet, or extra-wide —
   hours and the tub invoice.
4. **Door.** Inward, outward, or walk-through — hours and the
   door invoice.
5. **Extras.** Cast-iron demo, tile surround, grab bars,
   handheld, floor sistering, permit.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per tub, effective hourly rate, the hour
split, a four-scope comparison on the same bath, a five-unit
comparison on the same bath (the whirlpool upgrade versus the
soaker special), a three-way **who-supplies** comparison (you
supply the tub, they supply one that fits, they supply one
that does not), a three-way **when-you-can-work** comparison
(weekday they leave, only-bath-still-in-use, Saturday /
after-hours), and the **walk-away price**. Entering a price
already on the table scores it against the same cost base —
including the $995 “just install what I bought” special and
the $3,499 Saturday number.
**Copy bid summary** turns the result into a plain-text draft
ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-install-a-walk-in-tub.html`](how-much-to-charge-to-install-a-walk-in-tub.html),
[`should-i-install-a-customer-supplied-walk-in-tub.html`](should-i-install-a-customer-supplied-walk-in-tub.html),
[`should-i-take-a-saturday-walk-in-tub-call.html`](should-i-take-a-saturday-walk-in-tub-call.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`walk-in-tub-bid-usage` — never the alcove, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`tub_changed`, `door_changed`, `proposed_price_compared`,
`owner_supply_compared`, `access_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or HOA-color handling.
- One alcove type per bid. A second bath is another tub count,
  not a polygon of the house.
- Starting tub, door, and alcove rates are ballpark figures, not a
  catalog.
- Accessibility clearances, structural engineering, and plumbing
  design are not designed here — that is the contractor or the
  building official.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, accessibility,
plumbing-design, medical, legal, tax, or financial advice, and it
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
