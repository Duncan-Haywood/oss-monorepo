# Boiler Replacement Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/boiler-replacement-bid-calculator/>

A free browser calculator for hydronic and steam techs. It prices a
residential boiler replacement the way the trade actually loses
money — like-for-like versus a condensing upgrade versus a
steam-to-hot-water conversion, hot water versus steam, gas versus oil
versus propane, then zones, a chimney liner, an indirect tank, and
oil-to-gas — and shows the margin before the price goes out. It also prices the
9 p.m. “just patch it for $280” call against this winter’s callbacks
and the plant bid, whether hanging the boiler they bought at the
supply house still covers the set, and whether a Saturday / after-hours
no-heat call still pays after overtime.

**After using this, you can now** send a walk-away boiler-replacement
price that sees the plant and the extras, **which used to take**
matching a published $4,500 boiler special that treats an 80 MBH gas
hot-water swap as the same job as a steam conversion.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/boiler-replacement-bid-calculator -p 8080
# Run the tests
cd ventures/boiler-replacement-bid-calculator && node --test
```

## The problem it solves

Owners shop hydronic techs on a Facebook special: **$4,500 installed
boiler**. Those numbers cannot see the system or the extras.

- **Like-for-like** drops a same-fuel, same-system plant in the same
  size class. There is no vent redesign and no piping conversion.
- **Condensing upgrade** is a high-efficiency plant, a PVC or
  polypropylene vent, and condensate. **Steam-to-hot-water** is a
  piping job plus the same plant.
- **Hot water** is circulators and zone valves. **Steam** is a
  Hartford loop and a low-water cutoff. The cheap special assumes
  every house is a two-zone gas hydronic swap.
- **An indirect water heater, a chimney liner, oil-to-gas, and
  primary/secondary piping** are their own tickets. They do not live
  in a $4,500 dump.

Matching a cheap hot-water quote on a steam conversion is how a sold
boiler becomes a loss when the piping and the liner eat the margin.

This is distinct from **furnace** replacement (forced air, AFUE, a
matching coil), **water-heater** (a tank or tankless, not a hydronic
plant), **mini-split** (a line-set and heads), **fireplace-insert**
(a liner in a firebox), and **chimney sweep** (a flue cleaning). This
prices a boiler changeout.

## How it works

1. **Plant.** Input MBH, plus the number of heating zones.
2. **Scope.** Like-for-like, condensing upgrade, or steam-to-hot-water
   — plant hours, vent hours, and the boiler invoice.
3. **System.** Hot water or steam — hours per zone and hardware.
4. **Fuel.** Natural gas, oil, or propane — invoice per MBH.
5. **Extras.** Indirect tank, chimney liner, oil-to-gas, primary/secondary, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per input MBH, effective hourly rate, the hour
split, a three-scope comparison on the same plant, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **One more winter of patches** scores a $280 circulator
special against this visit, stacks extra no-heat calls and later
seasons, and sets that horizon next to the plant bid. **Who bought the
boiler** scores a $4,500 hang-only special against you-supply,
owner-supplies-it-matches, and owner-supplies-wrong-unit. **When you
can stand in the basement** scores a Saturday / after-hours no-heat
number against a weekday slot, same-day with no heat, and overtime
plus a second dispatch. **Copy bid summary** turns the replacement
result into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrases: [`how-much-to-charge-to-replace-a-boiler.html`](how-much-to-charge-to-replace-a-boiler.html),
[`should-i-patch-this-boiler-for-one-more-winter.html`](should-i-patch-this-boiler-for-one-more-winter.html),
[`should-i-install-a-customer-supplied-boiler.html`](should-i-install-a-customer-supplied-boiler.html),
[`should-i-take-a-saturday-boiler-call.html`](should-i-take-a-saturday-boiler-call.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`boiler-replacement-bid-usage` — never the plant, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`system_changed`, `fuel_changed`, `proposed_price_compared`,
`repair_compared`, `supply_compared`, `access_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, permit, or rebate handling.
- One plant. A second boiler or a snow-melt loop is extra MBH and
  zones, not a heat-loss calculation.
- Starting boiler, vent, and piping rates are ballpark figures, not a
  catalog.
- Heat-loss design, fuel-gas code, chimney engineering, and product
  warranties are not designed here — that is the tech or the
  manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not heat-loss, fuel-gas-code,
chimney-design, legal, tax, or financial advice, and it does not replace a
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
