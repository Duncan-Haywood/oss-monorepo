# PPF and Ceramic Coating Bid Calculator

A free browser tool for paint protection film (PPF) and ceramic coating shops: **enter the car, the package and your costs, and get a price, the film to buy with waste, the bay days the car occupies, and which package earns the most per bay day**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ppf-ceramic-coating-price-calculator/

After using this, you can now **quote PPF and coating from the film, correction hours and bay days a job really takes**, which used to take a rate card by vehicle class and a guess about cure days and redos.

## Use

1. Open `index.html`, pick the vehicle size, film package and coating, enter your film cost, labour, bay overhead, redo rate and margin, then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `encodeShare()`); tests: `node --test`.

Modelled: film footage by package and vehicle size with waste, install, correction and coating hours, tech days and cure days as bay days, bay overhead, an expected redo cost, margin as a share of the price, a minimum charge, every package side by side with profit per bay day, redo sensitivity, a share link. Not modelled: sales tax, insurance, brand warranty terms, extras such as headlight tint or chrome delete, travel, pattern-software cut figures.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
