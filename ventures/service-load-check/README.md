# Service Load Check

A free browser tool for homeowners and electricians: **can an existing home's electrical service take an EV charger, heat pump or induction range without a service upgrade?** It runs both checks the National Electrical Code allows for an existing dwelling, NEC 220.83 from an appliance list and NEC 220.87 from a year of the utility's interval data, and shows how much new load fits each way. It also sizes a new or replacement service for the whole house by NEC 220.82.

**Live tool:** https://marisstella.app/service-load-check/
**Guides:** https://marisstella.app/service-load-check/ev-charger-without-panel-upgrade.html (220.83 vs 220.87) and https://marisstella.app/service-load-check/what-size-electrical-service.html (220.82)

After using this, you can **tell whether "you need a 200 amp upgrade first" is a code requirement for your house or one method's answer**, and take the measured-demand figure to your electrician and inspector.

## Model

**220.83 (`calc.mjs`).** Other loads = floor area x 3 VA + 1,500 VA per small-appliance and laundry circuit + nameplate VA of every listed appliance (VA, or amps x volts). Demand = first 8,000 VA at 100% + remainder at 40%. If any *new* load is cooling, heating or a heat pump, 220.83(B): the larger of total cooling (AC + heat pumps) or total heating (electric heat + heat pumps) at 100%, plus the other loads at 8 kVA + 40%; otherwise 220.83(A), where existing HVAC is one more appliance (a heat pump counted once). Amps = VA / 240 (120/240 V) or / 208 (208Y/120 V, 3-wire). Room for more non-HVAC nameplate solves the piecewise rule exactly (1:1 below 8 kVA of other load, 2.5:1 above).

**220.87 (`interval.mjs`).** Reads Green Button CSV (one timestamp column; separate date and start/end-time columns; a "start to end" range column; any preamble) and Green Button XML (ESPI `IntervalReading`, with `powerOfTenMultiplier`, `uom` 72 Wh or 38 W, and `tzOffset`). Interval lengths come from end times or durations, else the median spacing. Readings that divide 15 minutes (1, 3, 5, 15) are summed into clock-aligned 15-minute blocks; incomplete blocks are dropped. Longer readings (30, 60 minutes) give a peak that is flagged as a screen only, since an hour's average is never above its busiest quarter-hour. Repeated timestamps (daylight-saving fall-back) keep the larger reading. Basis: >= 364 days of 15-minute data is a year; 30 to 363 days is the 30-day exception, shown with its conditions; less is a screen. Gaps over 3%, fewer than 12 calendar months, negative readings and a "has solar" answer each raise a warning. Total = 1.25 x peak kW x 1000 + new load at nameplate; it fits when total <= service amps x volts.

**220.82 (`calc.mjs`, `calc22082`).** The whole dwelling, existing and new loads alike. (B) general loads: floor area x 3 VA + 1,500 VA per small-appliance and laundry circuit + nameplate of every "appliance" row, first 10,000 VA at 100% and the rest at 40%. (C) heating and cooling, the largest that applies of: (1) cooling + heat pumps at 100%; (2) heat pump with no electric heat at 100%; (3) heat pump at 100% + heating at 65% (heat pump left out when the compressor is locked out during strip heat); (4) heating at 65% with fewer than four separately controlled units; (5) heating at 40% with four or more (units: the entered number, else one per heating row); (6) thermal-storage rows at 100%, in no other selection. Minimum service: the smallest 240.6(A) rating from 100 A to 400 A that covers the amps. In 220.83 a thermal-storage row counts as space heat.

**Charger setting (`report.mjs`).** The largest of 16, 24, 32, 40, 48 A whose amps x volts fits in the spare VA.

Tests (`calc.test.mjs`, `interval.test.mjs`, `page.test.mjs`) check 220.83 (A) and (B) and each 220.82(C) selection by hand, the 240.6(A) steps, that the room figure lands exactly on the rating, 220.87 arithmetic, each file shape above, block alignment on 5-minute data, the hourly, 30-day, gap and solar flags, and that every figure in both guides' worked examples is the engine's output.

**Code text.** The factors (3 VA/ft², 1,500 VA, 8 kVA at 100% and the rest at 40%, larger of heating or cooling in (B), 125% of a year's highest 15-minute demand; for 220.82, 10 kVA at 100%, 65% and 40% heating factors and the six selections) are as I read the 2017, 2020 and 2023 editions of NFPA 70, written from the published section summaries, not checked line by line against a licensed copy in this session. Local amendments and the inspector decide. Not modelled: the standard method of Article 220 Part III, demand factors for new loads under 220.87 (new loads count at nameplate, the conservative reading), power factor (kW read as kVA), conductor and breaker sizing, panel spaces, the utility's transformer.

## Run

Open `index.html` through any static server. Tests: `node --test *.test.mjs`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, engineering or financial advice and does not replace a qualified professional or the authority having jurisdiction.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded; pasted data and chosen files are read in your browser only. Anonymous feature counts (`check_run`, `example_loaded`,
`data_read`, `worksheet_printed`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
