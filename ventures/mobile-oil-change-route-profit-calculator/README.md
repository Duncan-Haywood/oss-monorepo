# Mobile Oil Change Route Profit Calculator

A free browser tool for independent mobile oil-change operators: **enter your weekly jobs by service type (conventional, synthetic, fleet or commercial stops), prices, quarts and oil and filter cost, used-oil disposal, on-site and drive minutes, the no-show rate, mileage and van costs, and get profit per job and per working hour including drive time, break-even jobs per week, the price each service type needs for your target margin, what no-shows cost, what batching fleet stops does to profit per hour, and the same route worked solo, with a franchise fee, or as an employee**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mobile-oil-change-route-profit-calculator/

After using this, you can now **set prices that clear your target margin once the drive, the oil and the no-shows are counted, group fleet stops where it pays, and judge a franchise fee or a job offer against working for yourself**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the week's jobs, the route and the fixed costs, then click Work out the route.
2. Pure logic is in `calc.mjs` (`plan()`, `typeLine()`, `modes()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three service types with weekly count, price, minutes, quarts, oil cost per quart and filter cost, disposal cost per vehicle, a flat trip fee, fleet vehicles per stop, drive miles and minutes per stop, a no-show rate with a user-set share of the price collected, insurance, tools, van and other fixed cost spread to a week, a weekly used-oil haul fee, restocking hours, the owner's hourly value, profit per job and per working hour, a target-margin price per type, break-even jobs per week, the weekly cost of no-shows, a fleet batching table, solo versus franchise (fee percent of revenue, extra volume, supplies) versus employed (wage, mileage reimbursement) with the equal-fee and equal-wage points, a volume table, a share link. Every default is an editable placeholder, not a market figure. Not modelled: used-oil disposal and handling regulations, EPA and state rules, permits; tips; sales and income tax; bad debt; vehicle purchase.
Arithmetic only. Not legal, tax, environmental or financial advice, and not an estimate of record. No warranty; see the page footer. MIT licensed (`LICENSE`).
