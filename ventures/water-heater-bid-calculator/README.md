# Water Heater Replacement Bid Calculator

A free browser calculator for plumbers and water-heater installers. It prices
a residential replacement from the heater type, the location, the vent, and
the gas or electrical path — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/water-heater-bid-calculator -p 8080
# Run the tests
cd ventures/water-heater-bid-calculator && node --test
```

After using this, you can now send a water-heater price that sees the
difference between a 50-gallon electric garage swap and an attic condensing
tankless on a 3/4-inch gas upsize, which used to take a spreadsheet the
plumber rebuilt on every estimate — or a flat "$1,200 installed" number that
loses money on the hard house.

## The problem it solves

Homeowners search “how much to replace a water heater” and come back with
$1,200. Installers who bid that number on every house eat the 3/4-inch gas
upsize, the concentric sidewall vent through brick, and the attic carry. The
jobs look the same in the inbox (“50-gallon water heater”) and are not the
same on the truck.

Two rules of the trade are what the flat price cannot see:

1. **The labor follows the type and the location, not the gallon sticker.** A
   garage electric tank is a same-day pull-and-set. A condensing tankless is
   a vent, a condensate drain, and usually a gas-line rebuild. An attic or
   crawl carry is a different labor day than a utility-room hang.
2. **The gas line follows the tankless, not the old tank.** The 1/2-inch
   supply that fed a 40,000 BTU atmospheric tank will not feed a 180,000 BTU
   tankless. Pricing that line as “already there” is how a $1,200 quote dies
   on the first visit.

At the default rates a typical 50-gallon electric garage swap lands near
$1,000. The same crew on an attic 9 GPM condensing tankless with a 25-foot
concentric vent, a 35-foot 3/4-inch upsize, a recirc, and a pan lands near
$5,600 — about 5× the easy job. That comparison is the number the installer
holds when a homeowner asks them to “just do what you did at the last house.”

## How it works

1. **Heater type.** Electric tank, atmospheric or power-vent gas tank,
   condensing gas tankless, electric tankless, or heat-pump. Base hours and
   fittings follow the family, not a blended “replace the heater” line.
2. **Location.** Garage, basement, closet, attic, or crawl. Access hours
   stack on top of the pull-and-set.
3. **Vent.** Reuse, new B-vent, power-vent sidewall, or concentric / PVC
   condensing. Length is dollars and minutes per foot, not a fuel-gas table.
4. **Gas and electrical.** Existing, 3/4-inch upsize, new run; existing
   circuit, new 240 V, new 120 V, or panel work for an electric tankless.
5. **Add-ons.** Expansion tank, drip pan, condensate, recirc, haul-away,
   seismic straps, mixing valve, tankless service valves.
6. **Loaded labor.** Wage × (1 + payroll burden %).
7. **Price.** (Labor + materials + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer’s number, not a markup on cost.

It then reports the walk-away price (total cost), effective hourly billing
rate, dollars per gallon or per GPM, a labor-hour split, a comparison to a
typical 50-gallon electric garage swap at the same rates, and warnings when
the gas line, vent, closet volume, or attic pan look wrong for the machine.
Paste a price already on the table to see whether it is underwater. **Copy
bid summary** and **Copy share link** turn the result into a plain-text draft
or a private hash URL that restores the same inputs.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is in [`share.mjs`](share.mjs) and is keyed off the
same field list, so a new input cannot silently drop off a shared link.

## Starting rates

Hours, vent dollars, gas-pipe dollars, and add-on kits ship as common takeoff
points. **They are not an industry standard, a code ruling, or a guarantee.**
Real jobs depend on access, the adopted plumbing and fuel-gas codes, the
electrical service, inspection queues, and the manufacturer’s installation
manual. Every length, wage, and fee is editable.

## Privacy

Nothing is uploaded. Every figure stays in the browser. A share link encodes
only the inputs the installer chooses to put in the address bar; opening it
does not ping us. The only thing stored is an anonymous local tally of which
features were used and the current date, in `localStorage` under
`water-heater-bid-usage` — never the house, wages, costs, or prices. A
draft of the last inputs is kept locally so a refresh does not wipe the
takeoff. Both are opt-out from the footer, and usage counting is skipped when
the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `proposed_price_compared`, `summary_copied`,
`share_link_copied`, `quote_printed`.

## Limitations

- Residential replacements only. Commercial packages, boilers, and tanks
  above 120 gallons or 15 GPM are rejected rather than guessed.
- Single currency and no tax handling.
- Capacity hints are not a first-hour rating, fuel-gas table, or manufacturer
  clearance you can stamp or submit.
- Gas-pipe sizing is dollars and hours per foot, not a fuel-gas code table.
- Electrical work is a takeoff line, not a load calculation or a panel
  schedule.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, electrical, engineering, code,
legal, tax, financial, or contracting advice, and it does not replace a
licensed plumber, electrician, or the authority having jurisdiction. **You
are responsible for reviewing and verifying its output before relying on
it**, and for meeting any permit, inspection, fuel-gas, or manufacturer
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
