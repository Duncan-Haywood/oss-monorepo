# Gig Driver Earnings Report Analyzer

A free browser tool for Uber, Lyft, DoorDash, Instacart and Grubhub drivers: **drop
in a trip or delivery history CSV and see what you really earn per hour and per mile
after the car.** The file is read in the browser; nothing is uploaded and no account
access is needed.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/gig-driver-earnings-report-analyzer/

After using this, you can now **see net pay per hour and per mile after vehicle cost,
which app, weekday and time of day pays best, how much of your pay the car takes, and
the trips that paid less than they cost to drive**, which used to mean giving a
mileage or earnings app access to your driver accounts or building the pivot table by
hand.

## Input

Any CSV with a `Date` (a time enables time-of-day results) and `Earnings` (or `Fare`,
`Pay`, `Total`). `Tip`, `Miles` (or `Distance`, `km` headers are converted),
`Minutes` (or `Duration`, or `Start`/`End` times) and `Platform` are used when present.
US and day-first dates, comma/tab/semicolon files and UTF-16 exports are read.
Unreadable rows are listed with a line number and reason.

## Model

Income is earnings plus tip. Vehicle cost is trip miles (plus an optional extra unpaid
miles percentage) times your cost per mile; the default 0.76 is the IRS business rate
from July 1, 2026 (72.5 cents before that, 70 cents in 2025; Notice 2026-10 and
Announcement 2026-11, as recorded in `ventures/mileage-deduction-method-calculator`)
and should be replaced with the rate for your trip dates or your own cost. Net is income minus
vehicle cost. Per-hour figures use trip minutes, or the total hours online you enter.
Groups under five trips are not ranked. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
