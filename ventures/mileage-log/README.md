# Mileage Log

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
