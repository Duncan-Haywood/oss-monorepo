# Bike Shop Repair Profit Calculator

A free browser tool for bike repair shops: **enter your job prices, bench minutes, materials, technician pay, tools and rent, and get profit per job and per bench hour, the price each job needs for your target margin, what a care plan really earns, the break-even volume, and the season at 50 to 150 percent of the volume you expect**. Nothing is uploaded.

**Live tool:** https://marisstella.app/bike-shop-repair-profit-calculator/

After using this, you can now **tell which job to push when the bench is full and how many jobs cover the stands and the rent**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the services, labor, fixed costs and passes, then click Work out the plan.
2. Pure logic is in `calc.mjs` (`plan()`, `seasonResult()`, `serviceLine()`, `passLine()`, `encodeShare()`); tests: `node --test`.

Modelled: three services with price, bench minutes and materials, burdened technician pay (for the scheduled bench hours, or per job for flat-rate or commission pay), profit per bench hour, a target-margin price per service, the tools spread over its seasons, rent for the open months, a care-plan membership with its break-even visits, bench-hour utilization, a break-even job count, a volume table, a share link. Not modelled: the owner's own pay, retail and rentals, sales tax, card fees, insurance, hiring a second technician, income tax.
**Known gaps:** the target-margin price carries none of the fixed cost, and there is no shop labor rate or productivity input. Fixed after the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-bike-shop-repair-profit-calculator.json): a technician paid by the hour is now charged for every scheduled bench hour, so idle hours come off the season result and break-even counts the schedule's pay (sample: 8,148.11, not 25,869.20); a "paid only for the time on jobs" choice keeps the per-job model for flat-rate or commission shops.

Not legal, tax or financial advice. No warranty; see the page footer. FSL-1.1-MIT licensed (`LICENSE`).
