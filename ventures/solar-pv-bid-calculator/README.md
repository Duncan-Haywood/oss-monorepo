# Solar PV Install Bid Calculator

A free browser calculator for solar installers. It prices a rooftop or
ground-mount PV job the way the trade actually loses money — watts, then a
roof-difficulty factor, then electrical extras that a dollars-per-watt quote
cannot see — and shows the margin before the price goes out.

**After using this, you can now price a 10 kW tile-roof job with a 100 A → 200 A
upgrade as a different job from a 10 kW composition-roof job on a clean 200 A
panel**, which used to take a spreadsheet that still started from a published
$/W and hid the extras.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/solar-pv-bid-calculator -p 8080
# Run the tests
cd ventures/solar-pv-bid-calculator && node --test
```

## The problem it solves

Homeowners and closers shop solar as dollars per watt. Equipment mostly does
scale that way. The roof and the service do not. Tile hooks, a 10/12 pitch, a
second array, a trench, or a main-panel upgrade are hours and material that
stay roughly the same whether the array is 6 kW or 12 kW. Matching a cheaper
$/W written for an easy composition roof is how a sold job becomes a loss.

The second thing that sinks these bids is payroll burden. An installer paid $38
costs more like $49 once employer taxes, workers' compensation, liability
insurance, and paid time off are counted. Pricing off the raw wage is short
before the first module is set.

## How it works

1. **System size.** Module count × watts per module. Not a rounded marketing kW.
2. **Array labor.** DC kW × hours per kW on an easy roof × roof factor
   (composition, steep, tile, metal, multi-array, or ground mount).
3. **Electrical extras.** Hours and material that do not scale with watts —
   a tap, a 100 A → 200 A upgrade, a 400 A service, a long run, or a trench.
4. **Battery / backup.** Optional hours and material, also outside array labor.
5. **Loaded labor.** Hourly wage × (1 + payroll burden %).
6. **Soft cost.** Permit and interconnection, design, travel / dumpster / lift.
7. **Price.** Direct cost plus overhead, then ÷ (1 − target margin %), because
   margin is quoted as a share of price, not a markup on cost.

It then reports the numbers an installer sanity-checks a bid against: dollars
per watt, effective hourly billing rate, the cost split, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a price
already on the table scores it against the same cost base. **Copy bid summary**
turns the customer-facing side into a plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

A short answer to the search query lives in
[`how-much-to-charge-to-install-solar-panels.html`](how-much-to-charge-to-install-solar-panels.html).

## Starting rates

Roof factors and electrical extras ship with common ballpark figures.
**They are not an industry standard, a benchmark, or a guarantee.** Real hours
depend on the crew, the roof, staging, the AHJ, and the utility. Every rate is
editable, and picking a preset never overwrites a number the installer has
already changed.

This tool is **not** a roofing bid (squares and tear-off), an EV-charger bid
(a branch circuit), a standby-generator bid (transfer switch, pad, and fuel),
or a water-heater replacement bid. It prices a PV array plus the electrical
work that array actually requires.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `solar-pv-bid-usage` — never the system size, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `system_preset_applied`, `roof_changed`,
`electrical_changed`, `proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax, incentive, or rebate handling. The federal
  credit, utility rebates, and sales tax are the customer's or the
  accountant's — this prices the install.
- One array as a single size. Multiple roofs can be approximated with the
  multi-array roof factor; they are not drawn as separate planes.
- No structural, wind, or interconnection engineering. Output is arithmetic.
- Starting roof factors are ballpark, not timed from a specific crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or electrical-code advice, and it does not replace a qualified professional.
It is not a structural, interconnection, incentive, or payback determination.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

Free support is optional and never required:
[the project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects).
