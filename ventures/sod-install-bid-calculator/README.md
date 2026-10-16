# Sod Installation Bid Calculator

A free browser calculator for landscapers. It prices a sod install the way
the trade actually loses money — whole pallets after waste, then soil prep,
delivery, slope, and watering — and shows the margin before the price goes
out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sod-install-bid-calculator/

**After using this, you can now** send a walk-away sod price that sees
pallets and dirt work, **which used to take** matching a published
$0.55-a-foot special that treats fescue pickup on ready soil as the same
job as strip-and-haul zoysia.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/sod-install-bid-calculator -p 8080
# Run the tests
cd ventures/sod-install-bid-calculator && node --test
```

## The problem it solves

Homeowners shop landscapers on a Facebook special: **$0.55 a square foot
installed**. That number cannot see the grass or the dirt.

- Farms sell **whole pallets**. A 2,000 sq ft lawn with 5% waste is 2,100 sq
  ft ordered and **five** 450-sq-ft pallets — 2,250 sq ft paid.
- **Ready soil** is a site walk. **Till-and-grade** is a crew morning.
  **Strip-and-haul** adds dump tickets and roughly twice the dirt hours.
- **Fescue, bermuda, and zoysia** are different farm invoices and different
  install rates. Zoysia is thicker and slower.
- **Delivery, slope, and watering visits** are their own tickets. They do
  not live in a per-foot special.

Matching a cheap fescue pickup on a strip-and-haul zoysia job is how a sold
lawn becomes a two-day loss after the first dump ticket.

This is distinct from **lawn-care** bidding (recurring mowing of living
grass) and from **artificial turf** (synthetic rolls, crushed-rock base, and
infill). This prices living sod.

## How it works

1. **Lawn.** Length × width, then waste for curves and edges.
2. **Pallets.** Ordered area ÷ pallet coverage, rounded up. You pay for the
   leftover coverage.
3. **Dirt and grass.** Prep hours from the method; install hours from the
   grass. Slope adds 20% to those two only.
4. **Extras.** Farm delivery trips, starter fertilizer, rolling, watering
   visits, extra irrigation heads, dump tickets.
5. **Loaded labor.** Hourly wage × (1 + payroll burden %).
6. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, price per pallet, effective hourly
rate, the hour split, a three-grass comparison on the same lawn, and the
**walk-away price**. Entering a price already on the table scores it against
the same cost base. **Copy bid summary** turns the result into a plain-text
draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-sod.html`](how-much-to-charge-to-install-sod.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under `sod-install-bid-usage` —
never the lawn, wages, costs, or prices. It is opt-out from the footer, and
it is skipped automatically when the browser sends Do Not Track or Global
Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `grass_changed`,
`prep_changed`, `delivery_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or permit handling.
- One rectangular lawn. Odd shapes are the waste percent, not a polygon.
- Starting farm rates are ballpark figures, not a catalog.
- Irrigation is extra heads only — not a full system design.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not landscaping, horticultural,
irrigation, construction, legal, tax, or financial advice, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

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
