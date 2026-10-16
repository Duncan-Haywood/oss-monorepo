# Toilet Replacement Bid Calculator

A free browser calculator for plumbers. It prices a toilet replacement
the way the trade actually loses money — swap-only on a good 12-inch
flange versus a new shutoff versus flange-repair versus a full reset,
two-piece versus comfort-height versus one-piece versus bidet-combo,
then haul-away, a wax-free seal, a bidet seat, whether an
owner-supplied bowl still leaves a margin on a $249 set, and whether
Saturday / after-hours still covers — and shows the margin before the
price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/toilet-replacement-bid-calculator/

**After using this, you can now** send a walk-away toilet-replacement
price that sees the closet and the bowl, **which used to take**
matching a published $249 installed special that treats a two-piece
12-inch swap as the same job as a one-piece flange repair.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/toilet-replacement-bid-calculator -p 8080
# Run the tests
cd ventures/toilet-replacement-bid-calculator && node --test
```

## The problem it solves

Owners shop plumbers on a Facebook special: **$249 installed**. Those
numbers cannot see the flange or the rough-in.

- **Swap-only** pulls a working toilet, sets a new wax ring, and hooks
  the existing supply. There is no flange work and no new shutoff.
- **New-supply** is a shutoff and a supply line. **Flange-repair** is
  a rotten closet or an extender. **Full-reset** is both.
- **Two-piece standard** is a stack. **Comfort-height** is a taller
  bowl. **One-piece** is weight. **Bidet-combo** is a seat and a nearby
  GFCI. The cheap special assumes every closet is a two-piece 12-inch.
- **Haul-away, a wax-free seal, and a bidet seat** are their own
  tickets. They do not live in a $249 dump.

Matching a cheap swap quote on a flange-repair job is how a sold
toilet becomes a loss when the closet bolts and the extra trip eat
the margin.

This is distinct from **walk-in shower** (tile, slope, glass),
**water-heater** (a tank), **hydro-jet / sewer camera** (cleaning a
line), **sewer-line replace** (the lateral), **septic pumping** (a
tank lid), **well-pump** (a well), **water-softener** (salt), and
**sump-pump** (a pit). This prices a toilet replacement.

## How it works

1. **Closet.** How many toilets, plus travel miles.
2. **Scope.** Swap-only, new-supply, flange-repair, or full-reset —
   hours and the flange / supply invoice.
3. **Bowl.** Two-piece standard, comfort-height, one-piece, or
   bidet-combo — hours and the fixture invoice.
4. **Rough-in.** 12-inch, 10-inch, or 14-inch.
5. **Extras.** Haul-away, wax-free seal, bidet seat.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per toilet, effective hourly rate, the hour
split, a four-scope comparison on the same closet, a four-bowl
comparison on the same closet (the one-piece upgrade versus the
two-piece special), a three-way **who bought the bowl** comparison
(you supply, they supply and it fits, they supply and it is the
wrong rough-in), a three-way **when you can work** comparison
(weekday scheduled, same-day while they stay home, after-hours /
Saturday), and the **walk-away price**. Entering a price
already on the table scores it against the same cost base, including
the install-only number on each supply path and each access window.
**Copy bid summary** turns the result into a plain-text draft ready
to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-replace-a-toilet.html`](how-much-to-charge-to-replace-a-toilet.html),
[`should-i-install-a-customer-supplied-toilet.html`](should-i-install-a-customer-supplied-toilet.html),
[`should-i-take-a-saturday-toilet-call.html`](should-i-take-a-saturday-toilet-call.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`toilet-replacement-bid-usage` — never the closet, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`toilet_changed`, `rough_in_changed`, `proposed_price_compared`,
`owner_supply_compared`, `access_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One trip. A second visit to reset a leaking wax ring is extra hours,
  not a callback warranty.
- Starting fixture, wax, and flange rates are ballpark figures, not a
  catalog.
- Plumbing-code design, rough-in engineering, and product warranties
  are not designed here — that is the plumber or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing-code, fixture-specification,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

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
