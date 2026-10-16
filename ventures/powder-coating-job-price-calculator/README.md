# Powder Coating Job Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/powder-coating-job-price-calculator/>

A free browser tool for powder coating job shops and small finishers: **enter the parts, the powder and how your shop runs, and get a price per piece and per square foot**. Nothing is uploaded.

After using this, you can now **quote a coating job from the powder it really uses, the oven batches it fills and the colour setup it costs**, which used to take a spreadsheet, a rule of thumb per square foot and a guess about overspray.

## Use

1. Open `index.html`, enter the job (pieces, square feet, mils, coats, oven batch size and cycle), your labour, overhead, scrap, margin and minimum charge, and one powder per line (`name, $ per lb, transfer efficiency %, reclaim %, specific gravity`), then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `quantityBreaks()`, `breakEvenQty()`, `sensitivity()`, `encodeShare()`); tests: `node --test`.

Modelled: powder weight from coverage, film thickness and specific gravity; transfer efficiency and reclaim; scrap; prep, masking, hanging and spray labour with overhead; colour setup per coat; whole oven batches and multiple coats; margin as a share of the price, rush surcharge and a minimum charge; price by order size; the order size that meets a customer's target price; a powder price sensitivity table; a share link that keeps the numbers in the URL. Not modelled: sales tax, freight, outsourced blasting or pretreatment, rack stripping, warranty beyond the scrap rate, local rates.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
