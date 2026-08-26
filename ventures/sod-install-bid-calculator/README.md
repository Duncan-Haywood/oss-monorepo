# Sod Installation Bid Calculator

A free browser calculator for landscapers. It prices a sod install the way
the trade actually loses money — whole pallets after waste, then soil prep,
delivery, slope, and watering — and shows the margin before the price goes
out.

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
used and the current date, in `localStorage` under `sod-install-bid-usage` —
never the lawn, wages, costs, or prices. It is opt-out from the footer, and
it is skipped automatically when the browser sends Do Not Track or Global
Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `grass_changed`,
`prep_changed`, `delivery_changed`, `proposed_price_compared`,
`summary_copied`, `bid_link_copied`,
`bid_link_opened`.

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
