# Shaved Ice Stand Profit Calculator

A free browser tool for shaved ice, lemonade and frozen-treat stands: **enter your prices, cup recipe, staff and the booth
fee, and see the margin per cup, the cups an event must sell to break even, profit on a hot, normal and rainy day, and the
most booth fee the event can bear.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shaved-ice-stand-profit-calculator/

After using this, you can now **say yes or no to an event with a number behind it**, which used to be a guess about the weather.

## Use

1. Open `index.html`, edit the numbers, click Work it out.
2. Pure logic is in `calc.mjs` (`analyze()`); tests: `node --test`.

Not modelled: sales and income tax, equipment cost, setup hours (add them to labour), cancelled events. Not tax or financial
advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
