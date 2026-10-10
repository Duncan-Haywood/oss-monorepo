# Oyster Farm Grow-Out Calculator

A free browser tool (and small Node CLI) for oyster growers: **enter seed, survival, gear, labor and
price, and see the cost per oyster sold, profit for the cycle, break-even price and break-even
survival.** A survival-by-price grid shows how far a bad batch or a soft market moves profit, and a
target box works back from oysters to sell to seed to buy. Nothing is uploaded.

After using this, you can now **tell what a market oyster really costs you and what survival your
price needs**, which used to be a spreadsheet rebuilt for each season or a guess at the dock.

## Use

1. Open `index.html`, enter the crop (or load the example), click Work out the cycle.
2. CLI: `node cli.mjs --seed 150000 --survival 70 --price 0.70 --months 16 [--json]`
   (exit 1 when the cycle loses money at that price).

Not modelled: nursery or upweller costs, loss beyond the survival entered, discounted culls,
depuration and processing, shipping, insurance, taxes and harvest-area closures. The tool holds no
seed prices, survival data or market prices; the example numbers are made up. Not legal, tax or
financial advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
