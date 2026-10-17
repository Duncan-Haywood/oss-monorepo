# Skylight Install Bid Calculator

A free browser calculator for roofers and window crews. It prices a
skylight install the way the trade actually loses money — one tubular
sun tunnel in an existing chase versus a solar-venting glass unit with
a new cut-in, tile flashing, and a drywall light shaft — and shows the
margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/skylight-install-bid-calculator/

**After using this, you can now** send a walk-away skylight price that
sees the unit and the opening, **which used to take** matching a
published $800 / unit special that treats a tube drop as the same job
as a venting cut-in.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/skylight-install-bid-calculator -p 8080
# Run the tests
cd ventures/skylight-install-bid-calculator && node --test
```

## The problem it solves

Owners shop roofers and window crews on a Facebook special: **$800 a
skylight installed**. Those numbers cannot see the unit or the opening.

- **Tubular sun tunnel** is a 10–14" tube dropped into a chase. That
  is the cheap special.
- **Fixed glass** is a curb unit with no vent. **Solar / electric
  venting** is the remote, the rain sensor, and a heavier curb.
- **Replace-existing** pulls the old unit and reuses a sound curb.
  **New cut-in** opens the roof and the ceiling and frames the hole.
- **Asphalt** takes a standard flashing kit. **Tile or metal** is
  specialty flashing. **Low-slope** is a built curb and extra
  waterproofing.
- **Drywall shafts, ice-and-water, laminated glass, shaft paint, and
  a second story** are their own tickets. They do not live in an $800
  dump.

Matching a cheap tube quote on a venting cut-in is how a sold opening
becomes a loss when the shaft and the flashing eat the margin.

This is distinct from **window replacement** (wall openings, united
inches), **asphalt shingle reroof** (squares and pitch), **metal roof**
(standing-seam panels), **solar PV** (dollars per watt), **sunroom**
(glazed walls), and **screened porch** (mesh panels). This prices a
skylight.

## How it works

1. **Units.** How many openings, plus how many interior shafts to
   finish and how many stories the ladder has to climb.
2. **Type.** Tubular, fixed glass, or solar / electric venting —
   hours and the unit invoice.
3. **Scope.** Replace-existing or new cut-in — pull, cut, and
   framing hours.
4. **Roof.** Asphalt, tile or metal, or low-slope — flashing hours
   and the specialty kit.
5. **Extras.** Ice-and-water, laminated / impact glass, shaft paint,
   travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per unit, effective hourly rate, the hour
split, a three-type comparison on the same openings, and the
**walk-away price**. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-a-skylight.html`](how-much-to-charge-to-install-a-skylight.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`skylight-install-bid-usage` — never the units, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `type_changed`,
`scope_changed`, `roof_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One visit. A second trip to finish interiors is extra hours, not
  a second mobilization row.
- Starting unit, flashing, and shaft rates are ballpark figures, not a
  catalog.
- Flashing design, structural engineering, ice-dam warranty, and
  product warranties are not designed here — that is the crew or the
  manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not roofing-specification, flashing,
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
