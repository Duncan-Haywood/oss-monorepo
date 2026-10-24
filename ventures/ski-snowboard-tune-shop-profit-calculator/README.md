# Ski and Snowboard Tune Shop Profit Calculator

A free browser tool for ski and snowboard tune shops: **enter your tune prices, bench minutes, materials, technician pay, grinder and rent, and get profit per tune and per bench hour, the price each tune needs for your target margin, what a season wax pass really earns, the break-even volume, and the season at 50 to 150 percent of the volume you expect**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ski-snowboard-tune-shop-profit-calculator/

After using this, you can now **tell which tune to push when the bench is full and how many tunes cover the grinder and the rent**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the services, labor, fixed costs and passes, then click Work out the season.
2. Pure logic is in `calc.mjs` (`plan()`, `seasonResult()`, `serviceLine()`, `passLine()`, `encodeShare()`); tests: `node --test`.

Modelled: three services with price, bench minutes and materials, burdened technician pay, profit per bench hour, a target-margin price per service, the grinder spread over its seasons, rent for the open months, a season wax pass with its break-even visits, bench-hour utilization, a break-even tune count, a volume table, a share link. Not modelled: the owner's own pay, retail and rentals, sales tax, card fees, insurance, hiring a second technician, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
