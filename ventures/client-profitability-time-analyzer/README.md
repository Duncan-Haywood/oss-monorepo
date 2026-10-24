# Client Profitability Time Analyzer

A free browser tool for freelancers, consultants and small agencies: **load a time export and
see what each client really pays you per hour.** The file is read in the browser; nothing is
uploaded and no tracker login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/client-profitability-time-analyzer/

After using this, you can now **see each client's effective hourly rate against your target,
the gap to it, non-billable time, flat-fee clients whose hours are creeping, and how
concentrated your hours are**, which used to mean a pivot table over a Toggl or Harvest export.

## Input

Any CSV with a `Client` and a `Duration` (or `Hours`): decimal, `1:30:00` or `1h 30m`. Used when
present: `Date`, `Billable` (yes/no), and `Amount` (or a `Billable Rate` multiplied by hours).
Flat-fee and retainer revenue for the same period is typed as `Client, amount` lines. **Column
names are matched by alias and no real tracker export was available**; if a file is not read,
the page lists the rows it skipped and why, and a sheet with the headers above always works.

## Model

Effective rate is revenue over all tracked hours, billable or not. Gap to target is target rate
times hours minus revenue for clients below target; the sum is an upper bound, not a forecast.
Scope creep compares later-half to earlier-half hours for mostly flat-fee clients. Unpaid
invoices, expenses, taxes and untracked time are not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
