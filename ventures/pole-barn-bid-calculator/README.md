# Pole Barn Bid Calculator

A free browser calculator for post-frame and pole-barn builders. It prices
a building the way the trade actually loses money — bays to posts and
trusses, then extra eave height, overhead doors, a lean-to, and gravel
versus a slab — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pole-barn-bid-calculator/

**After using this, you can now** send a walk-away pole-barn price that
sees eave height and the floor, **which used to take** matching a published
$45-a-foot special that treats a 10-foot gravel ag shell as the same job
as a 16-foot shop slab.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/pole-barn-bid-calculator -p 8080
# Run the tests
cd ventures/pole-barn-bid-calculator && node --test
```

## The problem it solves

Owners shop post-frame shops on a Facebook special: **$45 a square foot**
or **$28,000 for a 30×40**. Those numbers cannot see the eave or the floor.

- A 40-foot building on 8-foot centers is **5 bays, 14 posts, and 6
  trusses**. The coupon treats that the same as a 24-foot garage.
- **Each foot of eave above 10 feet** adds about 8% to frame and
  wall-steel hours. A 16-foot shop is not a 10-foot barn with taller
  walls sketched on.
- **Gravel** is a spread. A **4-inch slab** is ready-mix and a crew day.
  A **6-inch reinforced slab** is more yards and more steel.
- **Overhead doors, a lean-to, wainscot, insulation, and a shop panel**
  are their own tickets. They do not live in a per-foot special.

Matching a cheap 10-foot gravel quote on a 16-foot shop slab is how a
sold barn becomes a two-week loss after the first concrete ticket.

This is distinct from **fence** (posts and gates as a barrier), **deck
build** (posts and joists as a platform), **pergola** (posts and an open
shade layer), **garage-door** (springs and a header), **metal roof**
(panels on an existing house), **gravel driveway** (a loose-stone pad),
and **concrete slab pours** (the floor only). This prices a post-frame
building.

## How it works

1. **Building.** Length × width, then eave height and a rise-in-12 pitch.
2. **Bays.** Length ÷ post spacing, rounded up. Posts on both eaves plus
   two gable posts. Trusses on each post line.
3. **Extra eave.** Each foot above the included height multiplies frame
   hours. Wall steel grows with the taller walls.
4. **Floor.** Gravel, 4-inch slab, or 6-inch reinforced — yards, hours,
   and invoices.
5. **Extras.** Overhead and walk doors, lean-to, wainscot, insulation,
   electrical package.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-floor comparison on the same barn, and the **walk-away
price**. Entering a price already on the table scores it against the same
cost base. **Copy bid summary** turns the result into a plain-text draft
ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-build-a-pole-barn.html`](how-much-to-charge-to-build-a-pole-barn.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under `pole-barn-bid-usage`
— never the barn, wages, costs, or prices. It is opt-out from the footer,
and it is skipped automatically when the browser sends Do Not Track or
Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `floor_changed`,
`insulation_changed`, `electrical_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or engineered-stamp handling.
- One rectangular building plus an optional eave lean-to. Odd shapes are
  the post spacing, not a polygon.
- Starting lumber and ready-mix rates are ballpark figures, not a catalog.
- Snow load, wind, and soil are not designed here — that is the stamp.

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
