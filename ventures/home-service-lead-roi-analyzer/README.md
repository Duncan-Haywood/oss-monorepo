# Home Service Lead ROI Analyzer

A free browser tool for plumbers, electricians, HVAC techs, roofers and other home-service
pros who buy leads: **load a lead log and see which sources actually book jobs.** The file is
read in the browser; nothing is uploaded and no platform account access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/home-service-lead-roi-analyzer/

After using this, you can now **see cost per lead, close rate, cost per booked job, job value
and profit for every lead source (Thumbtack, Angi, HomeAdvisor, Google Local Services, Yelp,
ads, referrals), the close rate each one has to beat to break even, the paid sources that
lose money, and the spam, wrong-number and repeat leads you were charged for**, which used to
mean a pivot table over three platforms' billing pages and your own job notes.

## Input

Any CSV with a `Date`, a `Source` (or `Platform`) and a `Lead Cost` (or `Cost`; 0 for
referrals), plus a `Status` column (won, booked, lost, open, spam, wrong number, duplicate …)
or a `Job Value` column. `Service`, `Refund`/`Credit` and a `Lead ID` or customer name are
used when present. **Column names are matched by alias and no real platform export was
available**; if a file is not read, the page lists the rows it skipped and why, and a sheet
with the headers above always works. Comma/tab/semicolon files, quoted fields, US and
day-first dates and UTF-16 exports are read.

## Model

Spend is lead cost minus refund. Cost per booked job is a source's spend over the jobs it
won. Profit is job value times a job margin you type (35% default, a placeholder) minus
spend. Break-even close rate is cost per lead over average job value times margin. Sources
need five leads to be named a loser and two won jobs to be compared on cost per booked job.
Platform refund rules, lifetime value, seasonality and your time are not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
