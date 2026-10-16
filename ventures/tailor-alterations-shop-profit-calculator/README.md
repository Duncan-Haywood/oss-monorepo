# Tailor and Alterations Shop Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tailor-alterations-shop-profit-calculator/>

A free browser tool for independent tailors and alterations shops: **enter your hem, alteration and rework prices, bench minutes, supplies, tailor pay, machines and rent, and get profit per job and per bench hour, the price each job needs for your target margin, what a prepaid hem package really earns per visit, the break-even volume, and the season at 50 to 150 percent of the volume you expect**. Nothing is uploaded.

After using this, you can now **tell which job to push when the bench is full and how many jobs cover the machines and the rent**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the services, labor, fixed costs and hem packages, then click Work out the season.
2. Pure logic is in `calc.mjs` (`plan()`, `seasonResult()`, `serviceLine()`, `passLine()`, `encodeShare()`); tests: `node --test`.

Modelled: three services with price, bench minutes and supplies, burdened tailor pay, profit per bench hour, a target-margin price per service, machines spread over their seasons, rent for the open months, a prepaid hem package with its break-even visits, bench-hour utilization, a break-even job count, a volume table, a share link. Not modelled: the owner's own pay, retail and rentals, sales tax, card fees, insurance, hiring a second tailor, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
