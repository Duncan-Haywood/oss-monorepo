# Patreon Members Churn Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/patreon-members-churn-analyzer/>

A free browser tool for Patreon creators: **drop in your Members export CSV and see who
is leaving, what is at risk and what the fees leave you.** The file is read in the
browser; nothing is uploaded and no Patreon account access is needed.

After using this, you can now **see active, declined and former patron counts, monthly
recurring income (MRR) overall and by tier, the tenure distribution, churn by join
cohort and survival, the monthly income at risk from declined payments, how concentrated
income is in a few patrons or one tier, and an estimate of Patreon's fee take and your
net**, which used to mean sorting the export in a spreadsheet by hand.

## Input

A Members export CSV with `Patron Status` (or a `Pledge` amount) and ideally `Patronage
Since Date`. `Tier`, `Pledge`, `Currently Paying $`, `Lifetime $`, `Last Charge Date`,
`Last Charge Status`, `Charge Frequency` and `Name` are used when present; Email,
Twitter, Facebook, Country and the rest are ignored. **Column names are matched by alias
from memory of Patreon exports; no real export was available.** Comma/tab/semicolon
files, quoted fields, US and day-first dates and UTF-16 exports are read. Unreadable
rows are listed with a line number and reason.

## Model

Active patrons' pledges (annual divided by 12; per-creation pledges left out) make MRR;
declined patrons are at-risk income, not MRR. Tenure runs from the join date to the
as-of date (latest date in the file unless set), or to the last charge for former
patrons. Churn is former over everyone who ever paid, by join cohort and as survival at
1, 3, 6 and 12 months; groups under five patrons are not used for suggestions. Fees are
editable assumptions (default 10% platform, 2.9% + $0.30 processing per charge). See the
page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
