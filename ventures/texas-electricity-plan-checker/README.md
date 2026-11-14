# Texas Electricity Plan Checker

A free browser tool for Texas households in the competitive electricity market: **paste each plan's Electricity Facts Label (EFL) and a year of your own usage, and see what every plan would have cost you, month by month**. Bill credits and their kWh bands, tiered energy charges, minimum-usage fees, free-nights and free-weekends windows and TDU delivery charges are all billed on your months, and each label's terms are checked against the label's own average prices so a misread term shows up instead of a wrong ranking.

**Live tool:** https://marisstella.app/texas-electricity-plan-checker/ ([how it works](https://marisstella.app/texas-electricity-plan-checker/how-it-works.html))

After using this, you can **pick a plan on what it would have cost you over a real year**, not on the 1,000 kWh price a plan list sorts by, and see which months a credit plan would have missed its credit.

## Model (`engine.mjs`)

A month's bill = base charge + TDU fixed charge + energy charge + TDU per-kWh charge x kWh - every bill credit whose kWh band the month falls in + every minimum-usage fee whose condition it meets. Energy tiers are marginal (the first N kWh at one price, the rest at the next). Credit bands are inclusive at both ends; "more than N kWh" is read as N+1, since billed kWh are whole numbers. A time-of-use window (start and end hour, every day, weekdays or weekends; it may wrap past midnight) prices the kWh inside it at its own rate and the rest go through the tiers; with interval data each 15-minute reading is binned by weekday or weekend and hour, and without it the user gives the share of use assumed to fall in the windows. Taxes, the PUC assessment and other charges the label excludes are not counted; calendar months stand in for billing cycles.

**Label check (`labelCheck`).** An EFL states the average price at 500, 1,000 and 2,000 kWh, rounded to a tenth of a cent. The engine recomputes those three prices from the terms it has; a correct reading lands within 0.05 cents (0.06 allowed for rates printed to fewer digits than the provider used). A mismatch is shown beside the plan and in the ranking. Time-of-use labels are computed on a load profile the label names; the check needs that share typed in.

**Three prices alone (`shapeFromLabel`).** A plan with no credit, fee or tier costs a + b x kWh a month, so its three label points lie on a line. The line through the 500 and 2,000 kWh points predicts the 1,000 kWh bill; if the label's 1,000 kWh bill is more than $5 below it, something pays out near 1,000 kWh (a credit, or an energy charge that rises above it). For a credit that stops before 2,000 kWh the gap equals the credit exactly (tested); one that still pays at 2,000 kWh lowers that point too, so the gap understates it.

**EFL text reader (`parseEFL`).** Splits pasted label text into sentences and reads: the average price row, base charge, energy charge (flat, "0 - 1,000 kWh ... 8.2¢; > 1,000 kWh ... 12.9¢", "first N kWh"), TDU delivery charges ("$4.50 per month and 5.5¢ per kWh" in one sentence, under TDU, TDSP, delivery or a utility's name), bill credits (lower bounds from "greater than or equal to", "at least", "N kWh or more", "more than", "between"; upper bounds from "less than or equal to", "up to", "through"; "an additional $15 for 2,000 kWh or more" as a second credit), minimum-usage fees ("if usage is less than N kWh"), time-of-use windows with clock times, term and cancellation fee. It reports what it could not find; it never guesses a TDU rate, which changes twice a year and is printed on every label.

**Usage (`parseUsage`).** A Smart Meter Texas interval or daily CSV (columns `USAGE_DATE`, `USAGE_START_TIME`, `USAGE_KWH`, `CONSUMPTION_SURPLUSGENERATION`; any CSV with a date column and a kWh column works), with surplus-generation (export) rows left out; month lines such as `Jan 2025, 1243` or `2025-01 1243`; or bare numbers. Months with under 90% of their days are flagged.

## Verification

- `engine.test.mjs` (18 tests): tier arithmetic by hand; bill components; credit bands inclusive; every example plan reproduces its label; a misread credit fails the check; the three-price gap equals a credit exactly; ranking and credit-month counts; a 30% smaller household turns the credit plan from cheapest to dearest; a synthetic Smart Meter Texas file (96 readings a day plus export rows, June 2025) summed, binned by weekday and hour and billed on a free-nights plan by hand; time-of-use without interval data refuses to guess; three EFL texts read field by field and each matching its own label; a label with no TDU line or price table says so.
- `form.test.mjs`: the page's short forms round-trip every example plan.
- `page.test.mjs`: page wiring, no `innerHTML`, clauses on every page, page load does not count as a use, CLI output, and `check/resstock-results.md` is exactly what `check/resstock-check.mjs` prints.
- The EFL texts in the tests were **written for the tests** in the layout labels use (no provider's label could be fetched from this session); their figures are invented and consistent. Not yet checked: a real provider's EFL PDF copied through a browser, and a real Smart Meter Texas download (the column names follow its interval export).
- Driven in headless Chromium at 1280 and 390 px: no console errors, no horizontal scroll, label read into a new plan matches.

**200 simulated Texas homes (`check/`).** `check/resstock_tx.py` draws 200 occupied homes without rooftop PV from NREL's End-Use Load Profiles (ResStock AMY2018 release 2, 2018 weather, CC BY 4.0) in Harris, Fort Bend, Dallas, Tarrant and Collin counties, and keeps each home's monthly kWh and its kWh between 9 p.m. and 6 a.m. `check/resstock-check.mjs` bills them on the example plans plus an invented free-nights plan; results in `check/resstock-results.md`, summarised on the how-it-works page. These are building simulations, not meters, and the plans are invented: the result says how much the three label prices leave out for a realistic spread of Texas usage, not what any real plan costs.

## Run

Open `index.html` through any static server. Tests: `node --test *.test.mjs`. CLI: `node cli.mjs --example`, `node cli.mjs --usage usage.csv --efl label.txt [--json]`, `node cli.mjs --shape 21.0 8.1 14.1`. The ResStock check: `python3 -I check/resstock_tx.py` (pandas, pyarrow, numpy; about 1 GB downloaded one file at a time), then `node check/resstock-check.mjs > check/resstock-results.md`.

Not modelled: variable and indexed plans after signing (billed as printed), TDU rate changes during a contract, solar buyback credits, demand charges, autopay or paperless discounts, prepaid plans, billing-cycle dates, taxes.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not financial or legal advice and does not replace reading the plan's own documents.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.
Not affiliated with any retail electric provider, Power to Choose, Smart Meter Texas or the PUCT.

**Privacy.** Nothing is uploaded; pasted text and chosen files are read in your browser only. Anonymous feature counts (`analysis_run`, `example_loaded`, `label_read`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will
keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run
it yourself.

MIT licensed (`LICENSE`).
