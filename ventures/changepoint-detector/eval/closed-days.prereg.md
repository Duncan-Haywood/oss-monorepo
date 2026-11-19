# Closed days treated as missing: `--closed` (pre-registered 2026-11-19, before any watch ran with it)

Written and committed before the fill was coded into the watch and before any watch, replay or detector touched the
fresh series below. Only the daily CSV's shape (which days are zero) is read to build the closed list.

## The problem

README "A real shop's daily series" (2026-11-18): on UCI Online Retail (2010-12 to 2011-12), even with
`--period 7`, nine of sixteen column, period and budget cells sent an alert within a day of a one-day UK bank
holiday. A closed weekday is a single-point outlier the count model cannot absorb. The item left open was "one-day
closures (a `--closed` list of dates treated as missing, pre-registered, on a second shop)".

## The rule (fixed now)

`--closed <dates>` takes a comma list of YYYY-MM-DD dates (or `@file`, one date per line). Each listed date that is a
label of the series is filled before any detector sees it:

- lag L = `--period` if given; else 7 when the labels are consecutive calendar days; else 1;
- the fill is the median of the open values at i-L, i-2L, ... (open = not listed), up to the 4 nearest; if there is
  none, the nearest open value before i; if none (a closure at the very start), the nearest open value after i;
- for `--model poisson` the fill is rounded to a whole count.

Only earlier points feed a fill (except the start-of-series case), so filling the whole history once gives the
same values as filling each prefix, and a replay is honest. Dates listed but not in the series are ignored (a
deployer may list next year's holidays ahead). Nothing else in the watch changes.

## Fresh data

UCI Online Retail II (Chen 2019, CC BY 4.0, archive.ics.uci.edu dataset 502), sheet "Year 2009-2010": the same UK
gift shop's earlier year, 2009-12-01 to 2010-12-09, which no round has used. `eval/real-shop-daily.py` (extended to
read this file's column names) turns it into `data/online-retail-2009-daily.csv` with the same four columns.

The closed list for each year: every day that is not a Saturday and has zero orders, zero cancellations and zero new
customers (a calendar fact a deployer knows; the shape read only). The design year (2010-12 to 2011-12, already
seen) uses the same rule.

## Runs (fixed now)

`--columns orders:poisson,revenue,cancellations:poisson,new_customers:poisson`, `--period 7`, `--suggest` at the
default budget (2 per 100 checks) and at `--alerts-per 1/month`, once without and once with `--closed <list>`.
Script: `eval/closed-days.mjs`, output `eval/closed-days.out.txt`. An alert is "at a closure" when it is dated
within 1 day of a closed date.

## Bars (fresh year only; the design year is reported, not barred)

- **K1, the purpose:** at each column's suggested setting, both budgets, the alerts at a closure summed over the 4
  columns x 2 budgets are 0 with `--closed`. Without `--closed` the sum must be at least 1, or K1 is reported as
  untested rather than passed.
- **K2, no new noise:** Quiet's alerts summed over the 4 columns with `--closed` are no more than without.
- **K3, the real changes kept:** of the alerts at the suggested settings without `--closed` that are more than 3
  days from every closed date, at least 80% have an alert dated within 3 days on the same column and budget with
  `--closed` (reported as untested if there are fewer than 3 such alerts).
- **K4, simulation (fresh seeds 20261119):** 200 daily series of 371 days from a Monday; Saturdays zero; other days
  Gamma-Poisson with mean 40 (Sunday 24) and shape 20; 6 one-day closures (zero) on distinct non-Saturday days
  drawn from points 84 to 360; 100 of the series also get a +40% step on a day drawn from 150 to 330. Quiet
  (`bocpd`, `--model poisson`, `--period 7`), replayed. **K4a:** with `--closed`, at most 2 of the 100 no-step series
  send an alert at a closure. **K4b:** steps caught (an alert dated within 7 days of the step) with `--closed` are
  at least those without, minus 3 (of 100).

## What ships

All four bars pass: `--closed` ships on the CLI watch (both one column and `--columns`) and the agent tool, with the
README section. Any bar fails: written up as failed; the option is not offered.
