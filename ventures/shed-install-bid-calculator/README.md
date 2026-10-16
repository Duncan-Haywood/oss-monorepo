# Shed Install Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shed-install-bid-calculator/>

A free browser calculator for shed dealers and backyard-building crews. It
prices an install the way the trade actually loses money — pad, delivery
miles, crane versus forklift, then ramp, windows, loft, and haul-away —
and shows the margin before the price goes out.

**After using this, you can now** send a walk-away shed-install price that
sees the pad and the delivery, **which used to take** matching a published
$2,499 drop-and-set special that treats an existing-pad 10×12 as the same
job as a lofted kit plus gravel.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/shed-install-bid-calculator -p 8080
# Run the tests
cd ventures/shed-install-bid-calculator && node --test
```

## The problem it solves

Owners shop shed dealers on a Facebook special: **$2,499 installed** for a
**10×12**. Those numbers cannot see the pad or the delivery.

- A factory-built drop-and-set onto an **existing level pad** with a
  forklift is a unit invoice plus a short set.
- A **kit assembled on site** is a different crew day. Stick-built is
  another one still.
- A **new gravel pad** is trucks and a spread. A **new slab** is
  ready-mix and a crew day. The cheap special assumes the pad is already
  there.
- **Delivery miles, a crane, a ramp, extra windows, a loft, and
  old-shed haul-away** are their own tickets. They do not live in a
  drop-and-set dump.

Matching a cheap existing-pad quote on a kit-plus-pad job is how a sold
shed becomes a two-day loss after the first gravel ticket.

This is distinct from **pole barn** (post-frame 30×40+ with bays, eave,
and trusses), **gravel driveway** (a driveway, not a shed pad),
**concrete pours** (the slab only), **pergola** (open shade),
**garage-door** (the door on an existing opening), and **hot-tub** (crane
and a pad for a spa). This prices a backyard shed.

## How it works

1. **Shed.** Length × width is the footprint.
2. **Fulfillment.** Drop-and-set, kit, or stick-built — hours and the
   unit or lumber invoice.
3. **Pad.** Existing (set only), new gravel, or new slab. The pad is the
   shed plus an overhang on every side.
4. **Delivery.** Trip hours plus miles, then forklift or crane access.
5. **Extras.** Ramp, extra windows and doors, loft, electrical, haul-away.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-pad comparison on the same shed, and the **walk-away
price**. Entering a price already on the table scores it against the same
cost base. **Copy bid summary** turns the result into a plain-text draft
ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-a-shed.html`](how-much-to-charge-to-install-a-shed.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under `shed-install-bid-usage`
— never the shed, wages, costs, or prices. It is opt-out from the footer,
and it is skipped automatically when the browser sends Do Not Track or
Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `pad_changed`,
`fulfillment_changed`, `access_changed`, `electrical_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or engineered-stamp handling.
- One rectangular shed plus a rectangular pad. Odd shapes are the
  overhang, not a polygon.
- Starting kit, gravel, and ready-mix rates are ballpark figures, not a
  catalog.
- Snow load, frost, and soil are not designed here — that is the stamp
  or the pad contractor.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not structural, construction,
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
