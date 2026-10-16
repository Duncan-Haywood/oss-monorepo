# Home Elevator Bid Calculator

A free browser calculator for accessibility and elevator contractors. It
prices a residential home elevator the way the trade actually loses
money — two-stop pneumatic through-floor versus winding drum versus
hydraulic versus traction MRL, through-floor versus a new wood or
masonry shaft versus glass, then a pit, a 240 V feeder, and a permit —
and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/home-elevator-bid-calculator/

**After using this, you can now** send a walk-away home-elevator
price that sees the stops, the shaft, whether they already
bought the unit, and whether they need it this Saturday after a
hospital discharge, **which used to take** matching a published
$18,995 pneumatic special — or a $4,995 “just set what I bought”
install-only number — that treats a through-floor tube as the same
job as a three-stop hydraulic in a new wood hoistway.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/home-elevator-bid-calculator -p 8080
# Run the tests
cd ventures/home-elevator-bid-calculator && node --test
```

## The problem it solves

Owners shop elevator contractors on a Facebook special: **$18,995
pneumatic home elevator installed**. Those numbers cannot see the
shaft or the pit.

- **Pneumatic vacuum** is a through-floor tube. There is no shaft
  and no pit.
- **Hydraulic** is a ram, a pit, and a machine closet.
  **Winding drum** is compact cable. **Traction MRL** is taller
  travel without a machine room.
- **Through-floor** is two deck cuts. **New wood** is framed.
  **Masonry** is CMU. **Glass** is a showpiece. The cheap special
  assumes every house is a through-floor tube.
- **A pit, a machine closet, auto doors, battery lowering, a
  240 V feeder, and a permit / inspection** are their own tickets.
  They do not live in an $18,995 dump.

Matching a cheap pneumatic quote on a hydraulic shaft job is how a
sold aging-in-place install becomes a loss when the hoistway and
the extras eat the margin.

This is distinct from **stair lift** (a chair on a rail — no shaft,
no pit, no cab), **wheelchair ramp** (carpentry: rise-to-run,
landings), **walk-in tub** (alcove plumbing), **walk-in shower**
(tile, slope, glass), and **entry door**. This prices a home
elevator.

## How it works

1. **Stops and travel.** How many landings, and how many feet the
   cab travels.
2. **Drive.** Pneumatic, winding drum, hydraulic, or traction MRL
   — hours and the unit invoice.
3. **Hoistway.** Through-floor, existing shaft, new wood, new
   masonry, or glass — hours and the shaft invoice.
4. **Cab.** Acrylic tube, standard enclosed, wood-panel, or glass.
5. **Extras.** Pit, machine closet, auto doors, battery, 240 V
   feeder, permit, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per stop, effective hourly rate, the hour
split, a four-drive comparison on the same house, a five-hoistway
comparison on the same house (the shaft upgrade versus the
through-floor special), a four-cab comparison (acrylic tube versus
standard versus wood-panel versus glass — the upgrade after they
shopped the tube), a who-supplies comparison (you supply the
unit versus they already bought one that fits versus a wrong
opening), a three-way **when-they-need-it** comparison
(weekday they leave, discharge week with next-day unit air
freight, Saturday overtime plus a weekend inspector), and the
**walk-away price**. Entering a price already on
the table scores it against the same cost base, including the
install-only number they quoted you. **Copy bid summary** turns
the result into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-install-a-home-elevator.html`](how-much-to-charge-to-install-a-home-elevator.html),
[`acrylic-vs-glass-home-elevator-cab.html`](acrylic-vs-glass-home-elevator-cab.html),
[`should-i-install-a-customer-supplied-home-elevator.html`](should-i-install-a-customer-supplied-home-elevator.html),
and [`should-i-expedite-a-home-elevator-for-hospital-discharge.html`](should-i-expedite-a-home-elevator-for-hospital-discharge.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`home-elevator-bid-usage` — never the stops, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `drive_changed`,
`hoistway_changed`, `cab_changed`, `cab_compared`, `proposed_price_compared`,
`summary_copied`, `owner_supply_compared`, `access_compared`.

## Limitations

- Single currency and no tax, HOA, or historic-district handling.
- One hoistway. A second cab or a dumbwaiter is another job.
- Starting unit, shaft, and set rates are ballpark figures, not a
  catalog.
- Structural design, elevator-code engineering, and product warranties
  are not designed here — that is the contractor or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not elevator-specification, structural,
building-code, accessibility, legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from
its use.

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
