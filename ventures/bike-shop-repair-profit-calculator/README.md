# Bike Shop Repair Profit Calculator

A free browser tool for bike repair shops: **enter your job prices, bench minutes, materials, technician pay, tools and rent, and get profit per job and per bench hour, the price each job needs for your target margin, what a care plan really earns, the break-even volume, and the season at 50 to 150 percent of the volume you expect**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bike-shop-repair-profit-calculator/

After using this, you can now **tell which job to push when the bench is full and how many jobs cover the stands and the rent**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the services, labor, fixed costs and passes, then click Work out the plan.
2. Pure logic is in `calc.mjs` (`plan()`, `seasonResult()`, `serviceLine()`, `passLine()`, `encodeShare()`); tests: `node --test`.

Modelled: three services with price, bench minutes and materials, burdened technician pay, profit per bench hour, a target-margin price per service, the tools spread over its seasons, rent for the open months, a care-plan membership with its break-even visits, bench-hour utilization, a break-even job count, a volume table, a share link. Not modelled: the owner's own pay, retail and rentals, sales tax, card fees, insurance, hiring a second technician, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
