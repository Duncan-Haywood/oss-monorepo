# Home Battery Planner

A free browser tool for households with solar, or thinking about a battery: **paste a year of your own smart-meter data and your own rate plan, and see what a battery would have saved you**, run the way batteries are actually set (self-powered or time-based) and next to the perfect-foresight ceiling, for several sizes and several rate plans, with payback.

**Live tool:** https://marisstella.app/home-battery-planner/ · **Guide:** [self-powered vs time-based, measured on forty homes](https://marisstella.app/home-battery-planner/self-powered-vs-time-based.html)

After using this, you can **tell an installer's savings estimate from what your own house would have saved**, pick the battery mode and rate plan that fit your export credit, and see where extra capacity stops paying.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| Installer quote / sales calculators (EnergySage, the battery makers' own estimators) | Savings from a typical house, often your bill total; lead capture | Your own hourly meter data, your own tariff line by line, the mode the battery will really run in, no contact details asked |
| Battery makers' apps (after purchase) | Show what the battery did | Answers before you buy, and compares sizes and plans |
| NREL SAM, HOMER, OpenSolar and installer design software | Full engineering models, desktop or paid, steep to learn | One page, a file from your utility, a plan in a few lines of text |
| Spreadsheet | Whatever you build | Hour-by-hour replay with losses, reserve, inverter limit, holidays, exports, and an exact optimum to compare with |

Path to revenue (payment rails off): free tool and lead magnet. Natural paid paths, each needing the owner: a branded PDF proposal for solar installers and energy advisors (bring the customer's Green Button file, hand back an honest savings page), and a tariff library kept current for the big US utilities.

## Model

**Meter (`meter.mjs`).** CSV (Green Button/Opower layout with separate date and start-time columns, signed readings; separate delivered and received columns; Smart Meter Texas rows marked surplus generation; any timestamp + kWh CSV) and Green Button XML (ESPI: delivered flow 1 minus received flow 19, or a net series; each reading type's own unit and power-of-ten multiplier; UTC to the local wall clock with the file's daylight-saving rules, via the shared `greenbutton.mjs`, the same file as `demand-charge-interval-analyzer` and `service-load-check`, and a test fails if they drift). Readings are summed into wall-clock hours (the fall-back hour holds both); a missing hour is filled with the same hour's average on nearby days and counted; daily data is refused.

**Rate plans (`tariff.mjs`).** A short text format, one price per line, the last matching line winning: `import jun-sep weekdays 16-21: 0.55`. Months and hours wrap; `holidays: weekend` prices US federal holidays (observed dates) as weekends; `export:` flat, by period, `import - 0.03`, or an hourly 12 x 24 table per day type; `fixed:` dollars a month. Several plans separated by `---` are compared.

**Battery (`dispatch.mjs`).** Net use n per hour; the battery changes only the grid flow g = n + grid-side charge - delivered discharge; each hour is billed g x import price (g > 0) or credited -g x export credit. One-way efficiency is the square root of the round trip. Stored energy stays between the backup reserve and full; charge and discharge are each limited to the inverter's kW; every mode starts the data at the reserve.

- *Self-powered*: charge only from spare solar, discharge whenever the house draws from the grid.
- *Time-based*: charge from spare solar any hour, discharge only in each day's highest-priced hours; with grid charging allowed, fill in the day's cheapest hours if top price x round trip > cheapest. A deliberately strict rule; real time-based modes often add forecasts.
- *Perfect-foresight ceiling*: dynamic programme over stored energy. The value-to-go is stored at K+1 levels (60 for the main battery, 30 in the size sweep) and read between them by linear interpolation; each hour's choice is searched over every reachable level plus the points where the hour's cost bends (stay, store exactly the spare solar, cover exactly the house's draw). The forward pass carries the exact stored energy and bills the flow it causes, so the schedule is feasible and its bill exact.

## How it was checked

- **Exact reference** (`eval/lp-check.py`, `eval/lp-check-2026-11-18.md`): each case written by `eval/lp-cases.mjs` solved as one linear programme by HiGHS (SciPy 1.17.1): charge, discharge, import, export and stored energy per hour, the same limits. 32 full-year cases (the synthetic year and three ResStock homes; two plans; four batteries with and without grid charging and battery export): the programme's saving is within **0.21%** of the optimum in every case (worst $1.51 a year), mostly under 0.01%. A plain level grid without the interpolation and bend points was tried first and lost 3-4% to quantization (spare solar could not be stored exactly); that is why the programme looks the way it does.
- **Tests** (`node --test *.test.mjs`): bill and self-powered arithmetic by hand (losses, inverter limit, reserve); lossless arbitrage equals capacity x price gap x days; a spread below the round-trip loss is not traded; with losses the arbitrage saving matches 1.8 x 0.40 - (2/0.9) x 0.10 a day; 20 random short cases against a brute-force search on a 0.05 kWh grid; the optimum never beaten by the rule modes on a synthetic year; one-for-one net metering earns exactly nothing; 30 levels within 0.5% and 60 within 0.1% of 540; tariff precedence, wrap-around, export tables, the 2025 and 2026 federal holiday dates; readers for Opower, delivered/received, Smart Meter Texas and hand-built ESPI with daylight saving; page wiring and the guide's numbers against `check/resstock-results.md`.
- **Forty California homes with solar** (`check/resstock_ca.py`, `check/resstock-check.mjs`, results in `check/resstock-results.md`): occupied single-family homes with 5, 7 or 9 kWDC of PV from NREL ResStock AMY2018 release 2 (CC BY 4.0), every k-th by building id; net = total use + PV, moved from period-ending standard time to wall-clock interval starts. Building simulations on real weather, not meters; the prices are the page's invented examples. Low export credit (Plan A): self-powered median **97%** of the ceiling, peak-only 25%, self-powered ahead in 40 of 40. Near-retail export (Plan B): self-powered median **-$12** a year, peak-only $39, ceiling $239. Size: from 13.5 to 20 kWh adds a median $7 a year per extra kWh under Plan A.
- Driven in headless Chromium at 1280 and 390 px: the example runs in about 1.3 s, no console errors, no horizontal scroll.

Not checked: a real utility's Green Button file with solar (none was reachable from the build machine; the fixtures follow the ESPI schema and the Opower and Smart Meter Texas layouts), a real tariff sheet, a real battery's controller.

Not modelled: monthly or annual netting and true-up (credits count hour by hour in full), demand charges, non-bypassable charge details beyond `import - x`, battery wear and warranty throughput, outages, incentives, taxes, tariff changes, financing.

### Known gaps (quality audit, 2026-11-23)

From [`portfolio/quality/audits/2026-11-23-home-battery-planner.json`](../../portfolio/quality/audits/2026-11-23-home-battery-planner.json):

- **Time-based mode with "May charge from the grid" fills from the grid even when the day's spare solar would fill the battery for only the export credit** (`dispatch.mjs`, `runPeak`). On the example year, plan A, ticking the box cuts the time-based saving from about $874 to $213. Until it is fixed, compare time-based results with the box off; the ceiling (optimal) mode is not affected. The fix is to cap grid filling at the expected evening shortfall less the day's spare solar.
- Time-based days are 24-hour blocks from the first reading, not calendar days (under $1 a year on the example).
- Fixed in the same round: an `import 0-24:` line now covers all 24 hours (it covered none), and a Saturday New Year's Day is now observed on Friday, December 31 of the year before.

## Run

Open `index.html` through any static server. Tests: `node --test *.test.mjs`. CLI: `node cli.mjs --example`, or `node cli.mjs --meter usage.csv --plans plans.txt --kwh 13.5 --kw 5 --cost-fixed 3000 --cost-per-kwh 700 [--grid-charge] [--grid-export] [--json]`. The checks: `python3 -I check/resstock_ca.py DIR` (pandas, pyarrow), then `node check/resstock-check.mjs DIR > check/resstock-results.md` (about 3 minutes); `node eval/lp-cases.mjs [files] > cases.json && python3 eval/lp-check.py cases.json` (numpy, scipy).

No API key, account or server: everything runs in the browser.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, accounting, compliance, engineering, or financial advice. Results are arithmetic on figures you type or paste; verify with a qualified professional before relying on them. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

MIT licensed (`LICENSE`).
