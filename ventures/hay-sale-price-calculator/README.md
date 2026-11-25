# Hay Sale Price Calculator

A free browser tool (and small Node CLI) for hay producers: **enter acres, yield, growing and baling costs
and what each buyer offers per bale, and see the break-even price per ton and per bale, net profit per acre,
and which of small squares, large squares or round bales pays best.** A sensitivity table shows the best
channel's net when yield or price moves 20%. Nothing is uploaded.

**Live tool:** https://marisstella.app/hay-sale-price-calculator/

After using this, you can now **tell what your hay really costs per ton and which bale type to sell**, which
used to be a gut number or a spreadsheet rebuilt every season.

## Use

1. Open `index.html`, enter the ground and each channel (or load the example), click Compare the channels.
2. CLI: `node cli.mjs --acres 80 --tons 4 --grow 240 --small 8 --large 130 --round 95 [--json]`
   (exit 1 when no channel covers cost).

Not modelled: hay quality or relative feed value, moisture discounts, equipment depreciation beyond the
costs entered, taxes, seasonal price moves. The tool holds no price data; the example numbers are made up.
Not legal, tax or financial advice. No warranty; see the page footer.

Tests: `node --test`. FSL-1.1-MIT licensed (`LICENSE`); no secrets, no private dependencies.

## Known gaps (quality census, 2026-11-15)

From [`portfolio/quality/audits/2026-11-15-hay-sale-price-calculator.json`](../../portfolio/quality/audits/2026-11-15-hay-sale-price-calculator.json); per-bale amounts to the cent, rejecting non-numeric input and a ranking test are fixed. Still open: no hay quality basis (RFV/RFQ, USDA AMS grade) or moisture and dry-matter price adjustment; the extra storage loss per bale type (+0/+1/+4 points) is hard-coded, uncited and not shown; a blank price silently uses the default; the CLI has no flags for baling or selling cost.
