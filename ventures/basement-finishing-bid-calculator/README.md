# Basement Finishing Bid Calculator

A free browser calculator for basement remodelers. It prices a
basement finish the way the trade actually loses money — rec-room
paint and a drop ceiling versus framed-finish versus legal living,
carpet versus LVP, then a bath, egress windows, HVAC, and a permit
— and shows the margin before the price goes out.

**After using this, you can now** send a walk-away basement-finish
price that sees the scope and the extras, **which used to take**
matching a published $30 / SF special that treats 800 SF of rec-room
carpet as the same job as a legal bedroom suite.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/basement-finishing-bid-calculator -p 8080
# Run the tests
cd ventures/basement-finishing-bid-calculator && node --test
```

## The problem it solves

Owners shop remodelers on a Facebook special: **$30 a square foot
finished basement**. Those numbers cannot see the bath or the egress.

- **Rec-room** is paint, a drop ceiling, and carpet on walls that
  already stand. There is no framing and no bath.
- **Framed-finish** is studs, insulation, and drywall.
  **Legal-living** adds the habitable-space extras (bedroom circuits,
  smoke, egress path) that a per-SF dump never prices.
- **Drop ceiling** is a grid. **Drywall ceiling** is hang and finish.
  **Carpet** is the cheap special. **LVP** is more hours and a higher
  invoice.
- **A half bath, a full bath, egress windows, bedroom closets, a
  stair rebuild, a wet bar, HVAC, and a permit** are their own
  tickets. They do not live in a $30 dump.

Matching a cheap rec-room quote on a bedroom-suite finish is how a
sold basement becomes a loss when the wet work and the egress eat
the margin.

This is distinct from **basement waterproofing** (interior drain,
window wells, sump pit), **crawl-space encapsulation** (liner and
access), **drywall** (hang and finish gypsum as the job), **flooring**
(floor waste and tear-out), **interior painting** (a coat), and
**walk-in shower** (wet area, slope, glass). This prices a basement
finish.

## How it works

1. **Finished area.** Square feet of liveable floor, plus ceiling height.
2. **Scope.** Rec-room, framed-finish, or legal-living — hours and
   the framing / insulation / drywall invoice.
3. **Ceiling.** Drop ceiling, drywall ceiling, or already finished.
4. **Floor.** Carpet, LVP, or already done — hours and waste.
5. **Bath and extras.** None / half / full, egress windows, bedrooms,
   stairs, wet bar, HVAC extend, permit, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-scope comparison on the same basement, and the
**walk-away price**. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into
a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-finish-a-basement.html`](how-much-to-charge-to-finish-a-basement.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`basement-finishing-bid-usage` — never the finished SF, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`ceiling_changed`, `floor_changed`, `bath_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or HOA-color handling. Permit is an
  optional line, not a jurisdiction lookup.
- One finished rectangle. A second room or a mechanical chase is extra
  square feet, not a polygon.
- Starting hours and material rates are ballpark figures, not a catalog.
- Waterproofing design, egress design, habitable-space certificates,
  and product warranties are not designed here — that is the remodeler
  or the inspector.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, waterproofing,
habitable-space, egress, legal, tax, or financial advice, and it does not
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
