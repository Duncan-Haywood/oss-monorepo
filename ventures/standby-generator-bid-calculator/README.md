# Standby Generator Installation Bid Calculator

A free browser calculator for electrical contractors and generator dealers. It
prices a residential standby (whole-house) generator install from the machine,
the transfer switch, the pad, the fuel line, and the setback — and shows the
margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/standby-generator-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/standby-generator-bid-calculator -p 8080
# Run the tests
cd ventures/standby-generator-bid-calculator && node --test
```

After using this, you can now send a standby-generator price that sees the
difference between a 22 kW natural-gas hang beside the house and a far-yard
propane set plus a 400 A automatic transfer switch, which used to take a
spreadsheet the installer rebuilt on every estimate — or a flat "$8,000
installed" number that loses money on the hard house.

## The problem it solves

Homeowners search “how much to install a standby generator” and come back with
$8,000. Installers who bid that number on every house eat the propane trench,
the 400 A service-entrance ATS, and the crane path to the far yard. The jobs
look the same in the inbox (“22 kW whole-house”) and are not the same on the
truck.

Two rules of the trade are what the flat price cannot see:

1. **The feeder follows the nameplate, the ATS follows the service.** A 22 kW
   unit at 240 V is about 92 A, so the feeder lands on a 100 A breaker. The
   transfer switch is sized to the 200 A or 400 A service, not to the
   generator. Mixing those two numbers is how a bid that looked fine on a 200 A
   house fails on a 400 A house.
2. **Fuel and setback move more money than the kW sticker.** Natural gas next
   to the meter is a short pipe. Propane is a regulator, a tank hookup, and
   often a buried line. Eighteen inches off the house is a different labor
   day than forty feet behind a detached garage.

At the default rates a typical 22 kW natural-gas hang lands near $6,100. The
same crew on a 26 kW propane far-yard set with a poured pad, a 60-foot trench,
and a 400 A ATS lands near $15,800 — about 2.6× the easy job. That comparison
is the number the installer holds when a homeowner asks them to “just do what
you did at the last house.”

## How it works

1. **Feeder.** Nameplate current = kW × 1000 ÷ 240 V, then the next standard
   breaker. Copper is the smallest 75 °C gauge that carries that breaker *and*
   stays inside a 3% voltage drop for the one-way feeder.
2. **Transfer switch.** Manual or automatic, 100 / 150 / 200 / 400 A. Hours
   and hardware follow the switch, not a blended “install” line.
3. **Pad.** Precast polymer kit or poured concrete whose area grows with the
   machine.
4. **Fuel.** Natural-gas pipe per foot, or propane regulator kit + tank hookup
   + pipe. A long NG run without a meter look is flagged.
5. **Labor hours.** Set-and-start call-out, plus feeder minutes, trench setup
   and feet, gas line, optional meter upgrade, extra hours for a far yard or a
   liquid-cooled package, plus inspection and commissioning.
6. **Loaded labor.** Wage × (1 + payroll burden %).
7. **Price.** (Labor + materials + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer’s number, not a markup on cost.

It then reports the walk-away price (total cost), effective hourly billing
rate, dollars per installed kW, a labor-hour split, a comparison to a typical
22 kW natural-gas beside-the-house hang at the same rates, and warnings when
the ATS is smaller than the service or the machine looks light for the load
mode. Paste a price already on the table to see whether it is underwater.
**Copy bid summary** and **Copy share link** turn the result into a plain-text
draft or a private hash URL that restores the same inputs.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is in [`share.mjs`](share.mjs) and is keyed off the
same field list, so a new input cannot silently drop off a shared link.

## Starting rates

Hours, copper dollars, ATS prices, and pad costs ship as common takeoff
points. **They are not an industry standard, a code ruling, or a guarantee.**
Real jobs depend on access, soil, gas-utility rules, inspection queues, the
adopted electrical and fuel-gas codes, and the manufacturer’s installation
manual. Every length, wage, and fee is editable.

## Privacy

Nothing is uploaded. Every figure stays in the browser. A share link encodes
only the inputs the installer chooses to put in the address bar; opening it
does not ping us. The only thing stored is an anonymous local tally of which
features were used and the current date, in `localStorage` under
`standby-generator-bid-usage` — never the house, wages, costs, or prices. A
draft of the last inputs is kept locally so a refresh does not wipe the
takeoff. Both are opt-out from the footer, and usage counting is skipped when
the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `proposed_price_compared`, `summary_copied`,
`share_link_copied`, `quote_printed`.

## Limitations

- Residential standby only. Commercial packages, diesel, and machines above
  48 kW are rejected rather than guessed.
- Single currency and no tax handling.
- The recommended-kW hint is not a NEC 220 or manufacturer load calculation
  you can stamp or submit.
- Voltage drop uses copper, 240 V, and a 3% budget. Aluminum, 208 V, and
  different budgets are not modelled.
- Gas-pipe sizing is dollars and hours per foot, not a fuel-gas code table.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not electrical, engineering, code, legal,
tax, financial, or contracting advice, and it does not replace a licensed
electrician, plumber, or the authority having jurisdiction. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any permit, inspection, fuel-gas, or manufacturer obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
