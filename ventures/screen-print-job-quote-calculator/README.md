# Screen Print Job Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/screen-print-job-quote-calculator/>

A free browser tool: **enter an order and your shop's costs, and get the price per piece that hits your margin, a price-break
ladder by quantity, and the smallest order that pays at the price you were going to quote.** Nothing is uploaded.

After using this, you can now **quote a screen printing job and set quantity price breaks that still hold your margin**,
which used to be a gut-feel price per shirt and a spreadsheet.

## Use

1. Open `index.html`, enter your numbers, click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`); tests: `node --test`.

Screens = colours per location × locations. Spoiled blanks are bought and printed, so they sit in the cost. Not modelled:
artwork time, flash and cure, shipping, tax, payment fees. No warranty; see the page footer. MIT licensed (`LICENSE`).
