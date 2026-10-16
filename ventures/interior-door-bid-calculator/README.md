# Interior Door Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/interior-door-bid-calculator/>

A free browser calculator for carpenters. It prices an interior door
replacement the way the trade actually loses money — hang-only on an
existing jamb versus a prehung swap versus framing a new opening versus
a pocket conversion, hollow slab versus hollow prehung versus
solid-core versus French-or-barn, then paint, haul-away, and a new
lockset — and shows the margin before the price goes out.

**After using this, you can now** send a walk-away interior-door price
that sees the opening and the leaf, **which used to take** matching a
published $150-a-door installed special that treats a hollow slab hang
as the same job as a pocket-conversion French pair.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/interior-door-bid-calculator -p 8080
# Run the tests
cd ventures/interior-door-bid-calculator && node --test
```

## The problem it solves

Owners shop carpenters on a Facebook special: **$150 a door
installed**. Those numbers cannot see the opening or the leaf.

- **Hang-only** hangs a slab on the existing jamb. There is no frame
  work and no new casing package.
- **Prehung-swap** pulls the old unit and sets a new prehung.
  **New-opening** is a header and studs. **Pocket-conversion** is a
  wall pocket.
- **Hollow-core slab** is a cheap leaf. **Hollow-core prehung** is a
  builder unit. **Solid-core** is weight and a closer fit.
  **French-or-barn** is a pair of leaves or a track. The cheap special
  assumes every opening is an 80-inch hollow slab.
- **Paint both sides, haul-away, and a new lockset** are their own
  tickets. They do not live in a $150 dump.
- **Saturday / after-hours** is time-and-a-half plus a second
  dispatch. **Weekday while they stay home** is the same wage on a
  slower hang. Matching a weekday $349 on Saturday is how a sold
  hang becomes a loss.

Matching a cheap hang quote on a pocket-conversion job is how a sold
door becomes a loss when the header and the extra trip eat the margin.

This is distinct from **entry-door / front-door** (weather, sidelights,
transom, jamb-rot, a storm door), **patio-door / slider** (panels and
impact glass), **garage-door** (springs and a header), **plantation
shutter** (louvered panels), **crown molding** (a run of trim), and
**interior painting** (a coat). This prices an interior door
replacement.

## How it works

1. **Opening.** How many doors, plus travel miles.
2. **Scope.** Hang-only, prehung-swap, new-opening, or
   pocket-conversion — hours and the frame / casing invoice.
3. **Leaf.** Hollow slab, hollow prehung, solid-core, or
   French-or-barn — hours and the millwork invoice.
4. **Size.** 80-inch single, 96-inch / 8-foot single, or a double /
   pair.
5. **Extras.** Paint both sides, haul-away, new lockset.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per door, effective hourly rate, the hour split,
a four-scope comparison on the same opening, a four-leaf comparison on
the same opening (the solid-core upgrade versus the hollow-slab
special), a three-way **who-bought-the-leaf** comparison (you supply,
they supply and it hangs, they supply and it binds), a three-way
**when-you-can-work** comparison (weekday they leave, weekday they
stay, after-hours / Saturday), and the **walk-away price**. Entering
a price already on the table scores it against the same cost base —
including the $150 “just hang what I bought” special and the
“same $349 Saturday” number. **Copy bid summary** turns the result
into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-replace-interior-doors.html`](how-much-to-charge-to-replace-interior-doors.html),
[`should-i-hang-a-customer-supplied-door.html`](should-i-hang-a-customer-supplied-door.html),
[`should-i-hang-doors-on-saturday.html`](should-i-hang-doors-on-saturday.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`interior-door-bid-usage` — never the opening, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`door_changed`, `size_changed`, `proposed_price_compared`,
`owner_supply_compared`, `access_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One trip. A second visit to plane a binding leaf is extra hours, not
  a callback warranty.
- Starting millwork, casing, and hardware rates are ballpark figures,
  not a catalog.
- Building-code design, fire-rating, and product warranties are not
  designed here — that is the carpenter or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, fire-rating,
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
