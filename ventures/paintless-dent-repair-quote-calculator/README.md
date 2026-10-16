# Paintless Dent Repair Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/paintless-dent-repair-quote-calculator/>

A free browser tool for paintless dent repair (PDR) and hail techs: **enter the dents by size, the share on aluminum and body lines, your tech time and costs, and get a cost-plus price, whether your per-dent matrix covers it, the tech days the car holds a stall, and how the quote moves as the hail count changes**. Nothing is uploaded.

After using this, you can now **see where a flat per-dent matrix loses money and quote the higher, correct number**, which used to take a hail matrix and a guess about aluminum, body lines and remove-and-install time.

## Use

1. Open `index.html`, enter dent counts by size, your matrix rates (optional), tech time, overhead and margin, then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `encodeShare()`); tests: `node --test`.

Modelled: dent counts by coin-size band with minutes per dent, aluminum and body-line time uplifts, remove-and-install hours, tech days from techs and productive hours, stall overhead, an expected comeback cost, margin as a share of the price, a minimum charge, the matrix price against cost-plus, a conventional body-shop comparison, a total-loss line, a hail-count sensitivity table, a share link. Not modelled: sales tax, insurance, deductible handling, rental cars, glue-pull or paint extras, travel, insurer estimating software.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
