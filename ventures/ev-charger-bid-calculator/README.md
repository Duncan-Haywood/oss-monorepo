# EV Charger Installation Bid Calculator

A free browser calculator for electrical contractors. It prices a residential
Level 2 EV charger (EVSE) install from the circuit, the run, the trench, and
the panel work — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/ev-charger-bid-calculator -p 8080
# Run the tests
cd ventures/ev-charger-bid-calculator && node --test
```

After using this, you can now send a charger-install price that sees the
difference between a 25-foot indoor hang and a 70-foot trench plus a service
upgrade, which used to take a spreadsheet the electrician rebuilt on every
estimate — or a flat Facebook-ad number that loses money on the hard house.

## The problem it solves

Homeowners search “how much to install an EV charger” and come back with $800.
Electricians who bid that number on every house eat the trench, the 200 A
upgrade, and the long copper run. The jobs look the same in the inbox
(“Level 2 in the garage”) and are not the same on the truck.

Two rules of the trade are what the flat price cannot see:

1. **EVSE is a continuous load.** The breaker is 125% of the charger’s
   continuous current, rounded up to a standard size: 32 A → 40 A, 40 A → 50 A,
   48 A → 60 A, 80 A → 100 A. That changes the wire, the breaker cost, and
   whether the existing service has headroom.
2. **Voltage drop follows the feet, not the charger.** #6 copper that is fine
   for a 25-foot garage hang is not automatically fine for a 180-foot feeder.
   The tool upsizes when a 3% drop at 240 V would be exceeded.

At the default rates a typical indoor 48 A hang lands near $1,260. The same
charger on a 70-foot run, a 60-foot trench, and a service upgrade lands near
$4,590 — about 3.9× the easy job. That comparison is the number the electrician
holds when a homeowner asks them to “just do what you did at the last house.”

## How it works

1. **Circuit.** Continuous amps × 1.25, then the next standard breaker.
2. **Copper.** Smallest gauge in the 75 °C table that carries that breaker
   *and* stays inside a 3% voltage drop for the one-way run.
3. **Labor hours.** Mount-and-test call-out, plus minutes per foot of run
   (more outdoors), plus trench setup and feet, plus the panel-work hours
   (spare slot / relocate / subpanel / 200 A upgrade), plus paperwork and
   inspection. Outdoor locations add a disconnect; a pedestal adds a stand.
4. **Materials.** Wire, conduit, breaker, fittings, optional disconnect /
   pedestal / 14-50 device, trench restoration, permit, and optional charger
   hardware.
5. **Loaded labor.** Wage × (1 + payroll burden %).
6. **Price.** (Labor + materials + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer’s number, not a markup on cost.

It then reports the walk-away price (total cost), effective hourly billing
rate, dollars per circuit amp, a labor-hour split, a comparison to a typical
20-foot indoor 48 A spare-slot hang at the same rates, and a warning when the
entered service headroom is smaller than the new breaker. Paste a price already
on the table to see whether it is underwater. **Copy bid summary** and **Copy
share link** turn the result into a plain-text draft or a private hash URL that
restores the same inputs.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is in [`share.mjs`](share.mjs) and is keyed off the
same field list, so a new input cannot silently drop off a shared link.

## Starting rates

Hours, copper dollars, and breaker prices ship as common takeoff points.
**They are not an industry standard, a code ruling, or a guarantee.** Real
jobs depend on access, existing conduit, soil, inspection queues, and the
adopted electrical code. Every length, wage, and fee is editable.

## Privacy

Nothing is uploaded. Every figure stays in the browser. A share link encodes
only the inputs the electrician chooses to put in the address bar; opening it
does not ping us. The only thing stored is an anonymous local tally of which
features were used and the current date, in `localStorage` under
`ev-charger-bid-usage` — never the house, wages, costs, or prices. A draft of
the last inputs is kept locally so a refresh does not wipe the takeoff. Both
are opt-out from the footer, and usage counting is skipped when the browser
sends Do Not Track or Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `proposed_price_compared`, `summary_copied`,
`share_link_copied`, `quote_printed`.

## Limitations

- Residential Level 2 only. Commercial feeders, DC fast charge, and breakers
  above 200 A are rejected rather than guessed.
- Single currency and no tax handling.
- The service-headroom check is a subtraction, not a NEC 220 load calculation
  you can stamp or submit.
- Voltage drop uses copper, 240 V, and a 3% budget. Aluminum, 208 V, and
  different budgets are not modelled.
- Soil, rock, directional boring, and HOA / historic-district extras are
  “other hours / other materials,” not their own line.

## Disclaimer

This free tool is not electrical, engineering, code, legal, tax, or financial
advice, and it does not tell anyone what to charge or whether a panel is safe.
It is not a permit load calculation and it does not determine NEC or local-code
compliance. Outputs are arithmetic on the user's own inputs. Verify every
figure against a real takeoff, the charger nameplate, the adopted code, and a
licensed electrician before relying on it or submitting a bid. To the maximum
extent permitted by law, the authors accept no liability for loss or damage
arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
