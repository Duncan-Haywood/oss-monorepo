# Service Hourly Yield Analyzer

A free browser tool for businesses that sell hours (salons, barbers, spas, personal trainers,
tutors, mobile detailers): **drop in your booking or sales export and see which services earn the
most and the least per booked hour.** The file is read in the browser. Nothing is uploaded and no
scheduling-app login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/service-hourly-yield-analyzer/

After using this, you can now **see revenue per booked hour by service, staff member, weekday and
hour of day, which services earn under your average for the chair time they take, what a price
change on them could be worth, and what an idle hour costs**, which used to mean a pivot table over
a Square Appointments, Acuity, Vagaro, Fresha, Booksy, Mindbody or Jobber export.

Related: [`appointment-no-show-analyzer`](../appointment-no-show-analyzer/) (what missed bookings
cost) and [`booth-rent-vs-commission`](../booth-rent-vs-commission/).

## Input

- CSV with a **start date**, a **price** and a **duration** (minutes, hours, `1h 30m`, `1:30`) or an
  **end time**. `Service`, `Staff`/`Stylist`/`Provider` and `Status` are used when present; with no
  status column every row counts as completed.
- Typed: low-yield threshold (default 75% of the overall figure), the price-change what-if
  (increase %, expected volume lost %), and optional open hours per week.

**Column names are matched by alias and unverified against real exports.**

## Model

- Yield = summed price / summed hours of the *same* completed bookings that have both values.
- Rows missing a price or a duration are left out and counted, never guessed.
- No-shows with a known length are reported as empty chair time; cancelled and open rows are left
  out.
- Groups under 5 bookings are marked and never named best or worst.
- What-if = flagged revenue x (1 + increase) x (1 - volume lost). Assumptions, not a forecast.
- Not modelled: tips, products, fees, wages, supplies, prep time. Revenue per hour is not profit.

## Run and test

Static ES modules, no build and no dependencies. Open `index.html`, or `node --test`.

## Disclaimer

No warranty. Not legal, tax or financial advice. Estimates depend on the file and the assumptions
typed; verify before relying on them. Independent of every scheduling vendor named. Nothing is
uploaded; usage events are counted only in local storage and can be switched off.

MIT licence.
