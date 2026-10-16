# Mobile Tire Van Job Picker

Taking calls in the order they ring, or the biggest ticket first, fills a one-van day with the wrong work. Paste
the day's requested jobs (price, materials, minutes on site, the window the customer gives, where they are) and get
the exact set and order of jobs with the highest profit for the day, the drive and idle time it implies, what each
job it turns down would need to pay, and what first-come and biggest-ticket-first dispatch leave behind. Browser
page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mobile-tire-van-job-picker/

```
node cli.mjs plan jobs.csv --start 08:00 --end 17:00 --hourly 35 --per-mile 0.70 --json
cat jobs.csv | node cli.mjs plan - --speed 25
```

Input: rows of `name,price,materials,service_min,earliest,latest_start,east_miles,north_miles[,note]`. See `fixtures/jobs.csv`.

## How it decides

A job earns price less materials less the hourly van-and-tech cost of its on-site minutes. Each drive costs a
per-mile amount plus the hourly cost of the drive minutes; drive minutes are straight-line miles x circuity /
speed. Waiting for a window to open is free. The van leaves the depot at shift start and must be home by shift
end. The best day is found exactly by dynamic programming over (set of jobs done, last job), keeping every
non-dominated (finish time, profit) pair per state; the tests check it against every ordering of every subset.
A declined job's break-even price is exact: its price plus the gap between the best day and the best day forced to
include it.

## What it is not

Not a forecast and not a routing service: one van, one depot, straight-line distance times your circuity factor,
up to 14 jobs. Traffic, a second technician, jobs that must follow each other and cancellations are not modelled.
Not financial or business advice, no warranty. It does not know about motor-club or fleet obligations, and a
stranded or unsafe driver comes before any optimum.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
