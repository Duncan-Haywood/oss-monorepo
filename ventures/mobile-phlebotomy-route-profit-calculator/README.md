# Mobile Phlebotomy Route Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-phlebotomy-route-profit-calculator/>

A free browser tool for independent mobile phlebotomists: **enter your weekly draws by type (routine home or office, STAT, facility or batch visit), fees, on-site and drive minutes, supplies, the share of trips that fail at the door, mileage cost and fixed costs, and get profit per draw and per working hour including drive time, break-even draws per week, the fee each draw type needs for your target margin, what failed trips cost, what batching stops does to profit per hour, and the same route worked solo, as an agency contractor, or as an employee**. Nothing is uploaded.

After using this, you can now **set a fee per draw and a trip fee that clear your target margin once the drive and the no-answer trips are counted, group stops where it pays, and judge an agency's take or a job offer against working for yourself**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the week's draws, the route and the fixed costs, then click Work out the route.
2. Pure logic is in `calc.mjs` (`plan()`, `typeLine()`, `modes()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three draw types with weekly count, fee, minutes and supplies, a STAT premium, a flat trip fee, draws per home or office stop, drive miles and minutes per stop, a failed-at-the-door rate with a user-set share of the fee collected, insurance, certification renewal and other fixed cost spread to a week, lab drop-off hours, the owner's hourly value, profit per draw and per working hour, a target-margin fee per type, break-even draws per week, the weekly cost of failed trips, a batching table, a solo versus agency contractor (take percent, extra volume, supplies) versus employed (wage, mileage reimbursement) comparison with the equal-take and equal-wage points, a volume table, a share link. Not modelled: licensure, certification rules, CLIA and any state or payer requirement; tips; billing delays; sales and income tax; vehicle purchase; on-call time.
Arithmetic only. Not medical, legal, tax or financial advice, and not an estimate of record. No warranty; see the page footer. MIT licensed (`LICENSE`).
