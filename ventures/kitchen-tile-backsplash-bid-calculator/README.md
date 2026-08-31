# Kitchen Tile Backsplash Bid Calculator

A free browser calculator for tile setters and kitchen remodelers. It
prices a kitchen tile backsplash the way the trade actually loses
money — tile-only on a ready wall versus new prep versus
demo-and-replace, subway running-bond versus herringbone versus mosaic
versus large-format, you-supply versus a customer-supplied box, then
outlet cuts, a cooktop cutout, and Schluter — and shows the margin
before the price goes out.

**After using this, you can now** send a walk-away kitchen-backsplash
price that sees the wall and the pattern, **which used to take**
matching a published $35 / SF special that treats 30 SF of subway as
the same job as a herringbone demo.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/kitchen-tile-backsplash-bid-calculator -p 8080
# Run the tests
cd ventures/kitchen-tile-backsplash-bid-calculator && node --test
```

## The problem it solves

Owners shop tile setters on a Facebook special: **$35 a square foot
installed**. Those numbers cannot see the pattern or the pull.

- **Tile-only** sets on a wall that is already ready. There is no
  cement board and no demo.
- **New prep** is cement board or membrane, then tile.
  **Demo-and-replace** is a pull plus the same prep.
- **Subway running-bond** is a stack. **Herringbone** is cuts and
  waste. **Mosaic** is grout. **Large-format** is leveling. The cheap
  special assumes every splash is subway.
- **Outlet cuts, a cooktop cutout, Schluter / metal edge, and an
  accent band** are their own tickets. They do not live in a $35 dump.

Matching a cheap subway quote on a herringbone demo job is how a sold
splash becomes a loss when the cuts and the pull eat the margin.

This is distinct from **walk-in shower** (wet area, slope, glass),
**flooring** (floor waste and tear-out), **countertop** (slabs and
sink cutouts), **interior painting** (a coat), **cabinet refinishing**
(doors), and **drywall** (hang and finish gypsum). This prices a
kitchen tile backsplash.

## How it works

1. **Wall.** Square feet of splash, plus lineal feet of exposed edge.
2. **Scope.** Tile-only, new-prep, or demo-and-replace — hours and
   the board invoice.
3. **Pattern.** Subway running-bond, herringbone, mosaic, or
   large-format — hours and waste.
4. **Wall condition.** Painted drywall, cement board already up, or
   existing tile.
5. **Extras.** Outlets, cooktop cutout, Schluter, accent band, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-scope comparison on the same wall, a four-pattern
comparison on the same wall (the herringbone upgrade versus the subway
special), leftover boxes after box round-up (and whether a laundry /
pantry wall still needs a buy), a who-supplies comparison (you-supply
versus owner-covers versus short / wrong lot), a three-way **when you can work**
comparison (empty weekday versus they-cook-around-you versus after-hours /
weekend), and the **walk-away price**. Entering a
price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft ready to
paste into a proposal. Leftover stock does not change the headline bid
unless you decide that van inventory is already paid for.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-for-a-kitchen-tile-backsplash.html`](how-much-to-charge-for-a-kitchen-tile-backsplash.html),
[`should-i-install-customer-supplied-backsplash-tile.html`](should-i-install-customer-supplied-backsplash-tile.html),
[`should-i-tile-a-backsplash-after-hours.html`](should-i-tile-a-backsplash-after-hours.html).
Leftover boxes: [`do-leftover-tile-boxes-cover-the-next-wall.html`](do-leftover-tile-boxes-cover-the-next-wall.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`kitchen-tile-backsplash-bid-usage` — never the wall, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`pattern_changed`, `wall_changed`, `proposed_price_compared`,
`owner_supply_compared`, `access_compared`, `summary_copied`, `boxes_compared`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One splash wall. A second elevation or a pantry return is extra
  square feet, not a polygon. Leftover-box coverage on that second
  wall uses the same waste rate; it is not a second polygon.
- Starting tile, waste, and prep rates are ballpark figures, not a
  catalog.
- Waterproofing design, substrate engineering, and product warranties
  are not designed here — that is the setter or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tile-specification, waterproofing,
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
