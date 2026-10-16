# Mileage Log

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mileage-log/>

A free, private mileage log for self-employed drivers and contractors that
works offline in the browser. Log a trip by odometer, typed miles or GPS, and
see the IRS standard-rate deduction, the Schedule C Part IV mileage split, and
the gaps in your log an examiner would look at. Not tax advice.

After using this, you can now **hand a tax preparer a dated, purposeful mileage
log priced at the right IRS rate for each trip**, which used to mean a $6-15 a
month tracker, or a notebook reconstructed in April.

## What it does

- Trip log: date, category (business, commuting, medical, charity, personal),
  from, to, purpose, client, odometer start/end or typed miles, tolls, parking.
- GPS tracking while the page is open: distance is summed in the browser;
  positions are not stored or sent.
- Deduction priced per trip date: business 70c (2025), 72.5c to June 30 2026,
  76c from July 1 2026; charity 14c; medical 21c/20.5c. Every rate can be
  overridden.
- Year summary and Schedule C Part IV numbers (total, business, commuting and
  other miles) from the January 1 and December 31 odometer readings.
- Audit-readiness findings: deductible trips missing a purpose or destination,
  odometer readings that contradict each other, duplicates, a log of mostly
  round numbers, trips entered long after the drive, business miles above the
  year's total, unlogged miles.
- Multiple vehicles: name the car on each trip and get miles, deduction and
  business-use share per vehicle, with each vehicle's own January 1 and
  December 31 odometer (the standard rate is claimed per vehicle).
- Repeat a trip: your most frequent deductible routes become one-tap buttons
  that fill the form, which is the fastest way to a contemporaneous log.
- Year-end report for a tax preparer: one standalone HTML file (totals, by
  vehicle, gaps in the log, every trip) to print or save as PDF. No script, no
  network.
- Employer reimbursement claim (`reimburse.mjs`): employees cannot deduct mileage on a federal return since 2018, so one HTML page lists business trips for a date range at the employer's per-mile rate (or the IRS rate by date), whole-cent rows that sum to the total, a monthly rollup, flagged missing purposes, and a note when the rate exceeds the IRS rate.
- CSV export for the year, JSON backup and restore for all years, print view.

## Limits (also stated on the page)

A web page cannot track in the background, so GPS works only with the page open.
Data lives in one browser: clearing site data clears the log, which is why
backup is prominent. Whether a trip is deductible, and whether the standard
rate is available for your vehicle, is for you and a tax professional.

## Run / test

```
node --test
```

Open `index.html` through any static server (ES modules need `http://`).

## Phone app

`mobile/` is an Expo (React Native) app that adds what the web page cannot:
automatic background drive detection, one-tap classification with a
suggested category, and the same pricing, audit and CSV code. First version,
tested at the logic level only; see `mobile/README.md`.

## Why use this instead of

MileIQ, Everlance and TripLog charge about $6-15 a month and track in the
background on a phone; QuickBooks Self-Employed bundles it. This is free, keeps
the data on your device, tells you what is weak in the log, and (new) handles
more than one vehicle and hands your preparer a report. The web page cannot track in the
background, so GPS needs the page open; the phone app in `mobile/` is the
answer to that (first version, not yet run on a device).

## Deploy your own copy

It is a static site with no build step and no credentials: fork the repository,
enable GitHub Pages on the fork for the `ventures/mileage-log` folder (or copy
the folder to any static host) and it runs. Nothing the owner operates is
involved. The donate link in the footer stays.
