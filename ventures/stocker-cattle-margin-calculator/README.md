# Stocker Cattle Margin Calculator

A free browser tool for stocker and backgrounding operators: **enter what you will pay for weaned calves, how long you will carry them and what it costs, and see margin per head and for the pen, the break-even sale and purchase price, and cost of gain against the value of the gain after the price slide.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/stocker-cattle-margin-calculator/

After using this, you can now **know the most you can bid per cwt at the sale barn and still clear a margin**, which used to take a spreadsheet rebuilt every season.

## Use

1. Open `index.html`, fill in the pen, click Calculate margin.
2. Pure logic is in `calc.mjs` (`plan()`, `slidePrice()`); tests: `node --test`.

Modelled: purchase, hauling, health, feed, pasture or yardage, financed interest, death loss, shrink, price slide, commission, price and death-loss scenarios. Not modelled: hedging, weather, taxes, split sales. Not financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
