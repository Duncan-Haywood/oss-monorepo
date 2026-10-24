# Route Account Pruner

A free browser tool for lawn, pool, pest, cleaning and other recurring route businesses: **paste or upload a CSV of
your accounts (price, visits per month, minutes on site, drive minutes, materials), say what an hour of route time
is worth to you, and get every account ranked by what it earns per route hour, with a keep, reprice or drop
recommendation that allows for customers who cancel when the price rises.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/route-account-pruner/

After using this, you can now **see which accounts are not worth the drive, what price would fix each, and how
much of your week is spent driving**, which used to take a spreadsheet and a guess.

## Model

- Input: rows of `account,price,visits,on-site minutes,drive minutes,materials` (a header may reorder columns by
  name; materials optional; price per month or per visit). Unreadable or out-of-range rows are skipped with a warning.
- Route hours = visits × (on site + drive) ÷ 60. Vehicle cost = driving hours × cost per driving hour.
- Earns per hour = (monthly price − materials − vehicle) ÷ route hours. Surplus = that net minus hour value × route hours.
- Accounts with surplus ≥ 0 are kept. For the rest, every increase from 1% to the limit is scored as
  (1 − cancel chance) × new surplus, cancel chance = rate per 10% × increase ÷ 10%, capped; a cancelled customer
  leaves surplus 0 (their hours are worth the hour value again). Best of keep, best increase, drop wins; ties go to
  keep. A cancel chance of 100% is a drop, not a price.
- Sensitivity: the verdict counts recomputed with the hour value 20% lower and 20% higher.
- Refuses: fewer than 5 accounts, or an hour value of zero.
- Warns: driving over 40% of route hours, zero drive minutes, no account below the line.

## Limits

Stop order and route density are not modelled, nor contracts, referrals, seasonality or replacement cost. The
cancellation response is an assumption the user types; it is not measured from data. Arithmetic on supplied numbers,
not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
