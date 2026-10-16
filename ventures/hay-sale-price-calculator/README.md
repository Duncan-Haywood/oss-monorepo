# Hay Sale Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hay-sale-price-calculator/>

A free browser tool (and small Node CLI) for hay producers: **enter acres, yield, growing and baling costs
and what each buyer offers per bale, and see the break-even price per ton and per bale, net profit per acre,
and which of small squares, large squares or round bales pays best.** A sensitivity table shows the best
channel's net when yield or price moves 20%. Nothing is uploaded.

After using this, you can now **tell what your hay really costs per ton and which bale type to sell**, which
used to be a gut number or a spreadsheet rebuilt every season.

## Use

1. Open `index.html`, enter the ground and each channel (or load the example), click Compare the channels.
2. CLI: `node cli.mjs --acres 80 --tons 4 --grow 240 --small 8 --large 130 --round 95 [--json]`
   (exit 1 when no channel covers cost).

Not modelled: hay quality or relative feed value, moisture discounts, equipment depreciation beyond the
costs entered, taxes, seasonal price moves. The tool holds no price data; the example numbers are made up.
Not legal, tax or financial advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
