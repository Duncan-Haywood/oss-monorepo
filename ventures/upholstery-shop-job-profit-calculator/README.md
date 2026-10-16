# Upholstery Shop Job Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/upholstery-shop-job-profit-calculator/>

A free browser tool for independent upholstery shops: **enter your dining chair seat, armchair and sofa prices, bench hours, fabric and foam cost, upholsterer pay, tools and rent, and get profit per job and per bench hour, the price each piece needs for your target margin, what a designer trade block really earns per job, the break-even volume, and the season at 50 to 150 percent of the volume you expect**. Nothing is uploaded.

After using this, you can now **tell which piece to push when the bench is full and how many jobs cover the tools and the rent**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the job types, labor, fixed costs and trade blocks, then click Work out the season.
2. Pure logic is in `calc.mjs` (`plan()`, `seasonResult()`, `serviceLine()`, `tradeLine()`, `encodeShare()`); tests: `node --test`.

Modelled: three job types with price, bench minutes and materials, burdened upholsterer pay, profit per bench hour, a target-margin price per job type, tools spread over their seasons, rent for the open months, a prepaid designer trade block with its break-even block size, bench-hour utilization, a break-even job count, a volume table, a share link. Not modelled: the owner's own pay, pickup and delivery, sales tax, card fees, insurance, hiring a second upholsterer, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
