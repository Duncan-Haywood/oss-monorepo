# Laser Cutting & Engraving Job Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/laser-cutting-engraving-job-price-calculator/>

A free browser tool for laser cutting and engraving shops, Etsy makers and sign makers: **enter the piece, the sheet stock and how your shop runs, and get a price per piece**. Nothing is uploaded.

After using this, you can now **quote a laser job from how many pieces nest on a sheet, the cut and engrave minutes and the setup it costs**, which used to take a spreadsheet and a guess per piece.

## Use

1. Open `index.html`, enter the piece (size, cut path, engraved share), the order, your laser rate, labour, setup, scrap, margin and minimum charge, and one material per line (`name, $ per sheet, sheet width, sheet height, cut in/min, engrave sq in/min`), then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `piecesPerSheet()`, `quantityBreaks()`, `breakEvenQty()`, `impliedMachineRate()`, `encodeShare()`); tests: `node --test`.

Modelled: grid nesting on whole sheets in both orientations; cut time by path, passes and speed; engrave time by area and speed; laser cost per hour; setup, loading and finishing labour with overhead; scrap; margin as a share of the price, rush surcharge and a minimum charge; price by order size; the order size that meets a customer's target price; what the target implies the laser earns per hour; a sheet price sensitivity table; a share link that keeps the numbers in the URL. Not modelled: design time, sales tax, shipping, marketplace fees, downtime, irregular-shape nesting, local rates.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
