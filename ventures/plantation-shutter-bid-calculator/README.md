# Plantation Shutter Bid Calculator

A free browser calculator for window-treatment shops. It prices a
residential plantation-shutter install the way the trade actually
loses money — product-on-site hang versus measure-and-install versus
template-and-custom, inside versus outside mount, paint-grade versus
stain-grade, then openings, panels, a second story, treatment
removal, and a bypass track — and shows the margin before the price
goes out.

**After using this, you can now** send a walk-away shutter-install
price that sees the openings and the extras, **which used to take**
matching a published $250-a-window special that treats a 30×60
2-panel hang as the same job as a stain-grade template house.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/plantation-shutter-bid-calculator -p 8080
# Run the tests
cd ventures/plantation-shutter-bid-calculator && node --test
```

## The problem it solves

Owners shop shutter shops on a Facebook special: **$250 a window
installed**. Those numbers cannot see the opening or the extras.

- **Product-on-site hang** is the cheap special: the shutters are
  already in the truck. There is no measure trip and no mill order.
- **Measure-and-install** is a typical shop job. **Template-and-
  custom** is a millwork path plus the same hang.
- **Inside mount** is jamb and sill. **Outside mount** is trim,
  returns, and more hardware. The cheap special assumes every
  opening is a 2-panel inside-mount paint-grade hang.
- **Treatment removal, a specialty / arched opening, a bypass
  track, a café / tier-on-tier split, and a second story** are
  their own tickets. They do not live in a $250 dump.

Matching a cheap hang quote on a template-and-custom house is how a
sold shutter job becomes a loss when the millwork and the second
story eat the margin.

This is distinct from **window replacement** (glass, united inches,
a nailing flange), **window cleaning** (panes), **patio door**
(sliders as an opening), and **interior painting** (a coat). This
prices a shutter install.

## How it works

1. **Openings.** Count, typical width × height, and panels per
   opening.
2. **Scope.** Product-on-site hang, measure-and-install, or
   template-and-custom — hang hours, measure hours, and the shop
   invoice.
3. **Mount.** Inside or outside — hours per opening and hardware.
4. **Grade.** Paint-grade / composite or stain-grade hardwood —
   invoice per square foot of shutter.
5. **Extras.** Treatment removal, specialty shape, bypass track,
   café split, stories, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per opening, price per shutter SF, effective
hourly rate, the hour split, a three-scope comparison on the same
openings, and the **walk-away price**. Entering a price already on
the table scores it against the same cost base. **Copy bid summary**
turns the result into a plain-text draft ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-plantation-shutters.html`](how-much-to-charge-to-install-plantation-shutters.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`plantation-shutter-bid-usage` — never the openings, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`mount_changed`, `grade_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or rebate handling.
- One typical opening size. Mixed widths on the same house are extra
  openings at the larger size, not a CAD takeoff.
- Starting shutter, hang, and mill rates are ballpark figures, not a
  catalog.
- Window-opening structural work, lead-paint handling, and product
  warranties are not designed here — that is the shop or the
  manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not window-design, building-code,
lead-paint, legal, tax, or financial advice, and it does not replace a
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
