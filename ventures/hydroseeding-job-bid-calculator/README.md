# Hydroseeding Job Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hydroseeding-job-bid-calculator/>

A free browser tool for hydroseeding contractors: **enter the job's size, seed, mulch and water per 1,000 sq ft, your tank, crew, travel and hydroseeder, and get the cost and profit of the job, the tank loads and crew hours it needs, the price per 1,000 sq ft that earns your target margin, a table of job sizes that shows where small jobs lose money, and the season against the jobs you expect**. Nothing is uploaded.

After using this, you can now **bid a hydroseeding job knowing what it costs and where your minimum charge has to sit**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the job and your costs, then click Work out the bid.
2. Pure logic is in `calc.mjs` (`plan()`, `jobLine()`, `seasonResult()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: seed, mulch, fertilizer/tackifier and water per 1,000 sq ft, tank loads from slurry gallons, crew hours (setup, spraying, refills) at loaded pay, travel, a minimum charge, a steep-slope premium, the hydroseeder spread over its years plus overhead, a target-margin price, a job-size table, a break-even job count, a volume table, a share link. Not modelled: the owner's own pay, sales tax, permits and bonds, seed warranties and callbacks, card fees, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
