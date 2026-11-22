# Maintenance Planner

A free CMMS (computerized maintenance management system) for small plants, workshops, facilities and fleets: **list your equipment, set each preventive job to repeat by date, by run hours or whichever comes first, and see what is overdue, open the work orders, keep spare parts above their reorder point and score PM compliance.** Its reliability section reads each machine's breakdown history and says whether scheduled replacement would actually help, and at what age. Nothing is uploaded.

**Live tool:** https://marisstella.app/maintenance-planner/

After using this, a maintenance lead who runs PMs from a spreadsheet or a wall calendar has one place that says what is due this week, how many hours it needs per trade, which parts to order, and which machines' breakdowns rise with age (worth a replacement interval) and which do not (worth inspection instead).

## Why someone would use it

| Today's option | What it does | What this does differently |
|---|---|---|
| UpKeep, MaintainX, Limble, Fiix (paid, per-user subscriptions) | Full CMMS: shared logins, mobile technician apps, purchase orders, approvals, IoT meters | Free, no account and no per-user fee; one browser and a data file. Adds a censored Weibull reading with an interval and a cost-optimal replacement age, which those products' MTBF/MTTR dashboards do not give |
| A spreadsheet of PM dates | Whatever formulas someone wrote | Calendar and meter triggers with whichever-first, fixed vs floating schedules, month-end handling, 10%-rule compliance, generated work orders, reorder points |
| Open-source CMMS servers (e.g. self-hosted PHP or Python apps) | Multi-user CMMS you install and run | Nothing to install or host; the same engine runs as a command line for a shared drive or a cron job |

## Use

1. Open the page and add assets (or import a CSV with columns `name, location, category, inService, meterUnit, criticality`), or press **Load the example plant** to see an invented food plant.
2. Add PM plans: a first due date, a calendar interval and/or a meter interval, fixed or floating, labour hours, trade and a checklist. Log meter readings as you take them.
3. The dashboard lists overdue and due-soon jobs; **Open work orders for everything due** makes one per plan (with its checklist and parts). Close each out with the date, meter reading, labour and downtime; the plan moves on and parts leave stock.
4. Mark breakdowns as failures with a cause code and, for assets you care about, enter the cost of a planned replacement and of a failure. The **Reliability** tab gives MTBF, MTTR, availability, the Weibull shape with its 90% interval, what it means, and the replacement age that minimises cost per day.
5. **Save data file** often: the browser copy is a convenience, not a backup.

Command line (Node 18+): `node cli.mjs maintenance-data.json` prints what is due, parts to order and each asset's failure pattern; `--csv` writes the PM status table, `--json` the whole summary, `--today YYYY-MM-DD` plans as of another day, `--example` runs on the example plant. A morning cron job can mail its output.

## Model

**Schedules (`schedule.mjs`).** Days are whole UTC day numbers. Months and years clamp to the month's last day (31 January + 1 month = 28 or 29 February), and a fixed schedule counts every occurrence from its start date rather than from the one before, so a plan due on the 31st returns to the 31st after February. *Fixed*: a completion satisfies its nearest occurrence and the next one is due; late work does not shift the cadence. *Floating*: the next due date is one interval after the last completion. *Meter*: the usage rate is a least-squares line through the readings in the last 120 days (all readings if fewer than three), and a reading lower than the one before starts a new meter (replacement or rollover). The next service is due at the last service reading plus the interval (floating) or at the next multiple of the interval from the plan's base reading (fixed), and its date is projected along the rate. With both triggers the plan is due at whichever comes first, and is overdue once the estimated meter passes the due reading even if the date has not come. "Due soon" is a lead window, by default 10% of the interval (1 to 14 days).

**Compliance.** A completed job is on time when it is no later than its due date plus 10% of the interval (or 10% of the meter interval); fixed-schedule occurrences that came due and were skipped, and an open occurrence past its tolerance, count as missed. Compliance = on time / (on time + late + missed).

**Workload.** Each plan is rolled forward over the next 12 weeks (meter plans along their rate) and labour hours are summed by ISO week and trade.

**Spare parts (`parts.mjs`).** Usage comes from completed work orders over the last 12 months, counted in 30-day buckets. Reorder point = mean demand over the lead time + z x (bucket sd) x sqrt(lead / 30), at least the stated minimum, with z for the part's service level. Parts on open work orders are counted as claimed, so available = on hand - claimed.

**Reliability (`reliability.mjs`).** Times between failures run from the in-service date to the first failure and between failures, in meter units when the asset has readings and days otherwise; the time since the last failure is right-censored. The two-parameter Weibull is fitted by maximum likelihood: the shape solves the profile score equation by bisection (it is monotone), and the scale follows in closed form; times are scaled by their maximum so large hour counts cannot overflow. The 90% interval on the shape is the likelihood-ratio interval (profile log-likelihood within chi-square(1, 0.9)/2 of the maximum). The reading says *wear-out* only when the whole interval is above 1, *early-life* only when it is below 1, and otherwise that the history cannot tell age-related failures from random ones. When failures on one asset carry different cause codes the pooled reading is flagged, and each cause that repeats is fitted on its own, because a belt, a sensor and a heater each have their own clock. The replacement age is Barlow and Proschan's age-replacement policy: replace at age T or on failure, minimising (Cp R(T) + Cf (1 - R(T))) / integral of R from 0 to T, by a scan and golden-section search, with Simpson's rule for the integral; it is offered only when the shape is above 1, a failure costs more than a planned replacement, and the saving over running to failure (Cf / MTTF) is at least half a percent.

## How it was checked

- `reliability.test.mjs`: the Lieblein and Zelen (1956) ball-bearing data (23 lifetimes) gives shape 2.1021 and scale 81.878, the published maximum-likelihood fit (2.102, 81.88). Two right-censored sets, the bearings censored at 100 (18 failures, 5 censored) and 40 simulated units (24 failures, 16 censored), match scipy 1.17.1's `weibull_min.fit` on `CensoredData` to better than 1 part in 10,000 (`eval/weibull-vs-scipy.py` writes `eval/weibull-vs-scipy.json`, which the test reads). A grid search over shape and scale finds no higher likelihood than the fit. The age-replacement optimum matches a brute-force scan with a separate trapezoid integral to 3 time units and the cost rate to 1 part in 10,000, and the run-to-failure rate matches Cf / (scale x Gamma(1 + 1/shape)). Gamma(5) = 24 and Gamma(1/2) = sqrt(pi).
- `schedule.test.mjs`: month-end clamping including leap years; a fixed monthly plan from 31 January returns to 31 March; fixed vs floating after a late job; lead windows; meter rate by least squares and across a meter reset; a meter plan's projected due day worked by hand (180 hours at 16 a day); fixed meter grids; whichever-first; compliance with a late job, a skipped month and an open occurrence past tolerance, against counts worked by hand; the 12-week forecast; ISO weeks across 2026-W53 and 2025-W01.
- `store.test.mjs`: malformed files are repaired and each dropped record named; generated work orders are not duplicated while one is open; closing one moves its plan on, logs the meter reading and takes its parts out of stock; reorder points for steady and lumpy demand; CSV import with quoted commas, a byte-order mark and a bad date; CSV export neutralises cells that start like formulas; the CLI runs on the example plant.
- `page.test.mjs`: every input has a label, every id the script reads exists, the FAQ markup matches the visible questions, nothing in the page or modules calls the network.
- The page was driven in headless Chromium: load the example, generate work orders, close one, reload (the data persists), at 1200 px and 390 px wide (no sideways scroll), with no console errors.

Not checked: a real plant's maintenance history or meter logs (the example plant is invented), and a maintenance manager's reading of the output. The renewal assumption (each repair restores the failed cause to as good as new) is stated on the page, not tested.

## Not modelled

Multiple users, logins and a mobile technician app; purchase orders, vendors and approvals; condition-based triggers from sensors; inspection-interval optimisation (delay-time models); imperfect repair (Kijima or ARA models); opportunistic or group replacement; statutory inspection rules. Data lives in one browser until exported.

## Privacy, usage counting and licence

Everything runs in the browser. The data is kept in this browser's local storage (`maintenance-planner-data`) and in files you save; nothing is uploaded. Anonymous feature events (`example_loaded`, `data_saved`, `csv_saved`, `data_opened`, `assets_imported`, `work_orders_generated`, `work_order_closed`, `work_order_added`, `plan_saved`, `reading_saved`, `asset_added`, `part_added`) are counted in local storage only, with an off switch on the page; Do Not Track and Global Privacy Control are honoured.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, safety or financial advice, and it does not replace a qualified professional or the equipment maker's instructions. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licensed (`LICENSE`).
