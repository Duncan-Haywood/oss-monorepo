# Carpet Installation Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/carpet-install-bid-calculator/>

A free browser calculator for carpet installers. It prices a carpet
install the way the trade actually loses money — stretch-in over pad
versus glue-down versus double-stick versus carpet tile, solid versus
patterned waste, then stairs priced per step, tear-out, furniture
move, and haul-away — and shows the margin before the price goes out.

**After using this, you can now** send a walk-away carpet-install
price that sees the stairs and the waste, **which used to take**
matching a published $2-a-yard special that treats a flat living-room
stretch as the same job as a patterned glue-down with fourteen stairs.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/carpet-install-bid-calculator -p 8080
# Run the tests
cd ventures/carpet-install-bid-calculator && node --test
```

## The problem it solves

Owners shop installers on a Facebook special: **$2 a yard installed**.
Those numbers cannot see the stairs or the waste.

- **Stretch-in** over pad is the cheap living-room special. There is
  no adhesive and no slab glue.
- **Glue-down** is adhesive on a slab. **Double-stick** is pad and
  carpet both glued. **Carpet tile** wastes less roll.
- **Solid** is no match. **Patterned** is match waste and extra
  seaming. The cheap special assumes every floor is a solid stretch.
- **Stairs are not yards.** Each wrap is tread, riser, and extra
  seaming. Floor yards do not see that labor.
- **Tear-out, furniture move, transitions, and haul-away** are their
  own tickets. They do not live in a $2-a-yard dump.

Matching a cheap living-room quote on a 13-stair house is how a sold
carpet becomes a loss when the wraps and the dump ticket eat the
margin.

This is distinct from **carpet cleaning** (steam, rooms, pet urine),
**flooring install** (LVP, hardwood, and tile as hard-surface waste),
**epoxy garage floor** (grind and flake), **hardwood refinishing**
(sand and finish), **kitchen tile backsplash** (a wall), and
**walk-in shower** (wet-area tile). This prices a carpet installation.

## How it works

1. **Floor.** Square feet (converted to yards), plus travel miles.
2. **Scope.** Stretch-in, glue-down, double-stick, or carpet tile —
   hours and the pad / adhesive invoice.
3. **Pattern.** Solid, textured, patterned, or berber — waste and
   extra seaming hours.
4. **Stairs.** Counted per step, not folded into floor yards.
5. **Extras.** Tear-out, furniture move, transitions, haul-away.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per yard, effective hourly rate, the hour
split, a four-scope comparison on the same floor, a four-stair-count
comparison on the same floor (13 stairs versus the flat-floor
special), and the **walk-away price**. Entering a price already on
the table scores it against the same cost base. **Copy bid summary**
turns the result into a plain-text draft ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-install-carpet.html`](how-much-to-charge-to-install-carpet.html)
and [`should-i-charge-extra-for-moving-furniture-on-a-carpet-install.html`](should-i-charge-extra-for-moving-furniture-on-a-carpet-install.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`carpet-install-bid-usage` — never the floor, wages, costs, or prices.
It is opt-out from the footer, and it is skipped automatically when the
browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`pattern_changed`, `proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One trip. A second visit to restretch a seam is extra hours, not a
  callback warranty.
- Starting mill, pad, and adhesive rates are ballpark figures, not a
  catalog.
- Flooring-spec design, moisture testing, and product warranties are
  not designed here — that is the installer or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not flooring-spec, moisture-test,
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
