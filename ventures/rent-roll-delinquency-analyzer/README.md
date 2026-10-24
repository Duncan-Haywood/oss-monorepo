# Rent Roll Delinquency Analyzer

A free browser tool for small landlords: **load a rent ledger and see who owes what, how old
it is, and who pays late.** The file is read in the browser; nothing is uploaded, so tenant
names stay on the landlord's device, and no property-management account access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rent-roll-delinquency-analyzer/

After using this, you can now **see unpaid rent by age (1–30, 31–60, 61–90, over 90 days) and
by unit, the units that habitually pay late, the share of rent collected and collected on
time each month, and an upper bound on late fees**, which used to mean a pivot table over a
ledger export and a calendar.

## Input

Any CSV with a `Due Date`, a `Unit` (or `Tenant`), an `Amount Due` (or `Rent`) and an
`Amount Paid`, one row per monthly charge; `Date Paid` is used when present and is needed for
late-payment figures. **Column names are matched by alias and no real property-management
export was available**; if a file is not read, the page lists the rows it skipped and why, and
a sheet with the headers above always works.

## Model

Owed is amount due minus amount paid on each charge due on or before the as-of day. Age runs
from due date to the as-of day. A charge is late when paid in full, or still unpaid, more than
the grace period (typed, 5-day placeholder) after its due date. Habitually late needs three
late charges and half of a unit's charges. The late-fee figure multiplies a fee the user types
by the late charges and is an upper bound: leases and local law decide what may be charged.
Notices, part-payment rules, deposits, interest and vacancy are not modelled. Not legal advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
