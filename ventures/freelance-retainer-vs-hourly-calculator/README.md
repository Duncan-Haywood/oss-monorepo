# Freelance Retainer vs Hourly Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-retainer-vs-hourly-calculator/>

Free, browser-only tool for freelancers, consultants and small agencies. Paste your
own time log (date, client, hours, optional billed amount), enter your hourly rate and
a monthly retainer you are considering, and it replays the retainer against your real
months for each client: monthly hours (mean, median, 80th percentile, seeded bootstrap
range), your effective hourly rate at the median, 80th-percentile and busiest month,
break-even hours, the share of months where hourly would have paid more, and the
retainer that would have hit a target rate in a chosen share of months. A hold-out
check says when the hours have shifted enough that the history is not a forecast.
Clients with fewer than 6 months are refused. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, monthly hours per client, percentiles, bootstrap, retainer maths, hold-out, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; a statistical description of data you supply, not
legal, tax or financial advice. It does not model scope creep, rollover, late payment,
taxes or unlogged work. Unverified against a published dataset: tested on hand-counted
logs and simulated hours with a known distribution.

MIT licence, see `LICENSE`.
