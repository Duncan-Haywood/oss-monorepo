# Pool Opening and Closing Price Calculator

A free browser tool for pool service owners: **enter the pool and your costs, and get a closing price, an opening price, a season bundle, the cost of a green pool, and how many stops fill a crew day**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pool-opening-closing-price-calculator/

After using this, you can now **quote spring opening and fall closing from gallons, cover and water condition**, which used to take a flat per-visit price and a bad surprise at the first green pool.

## Use

1. Open `index.html`, enter the pool (size, shape, cover, lines), the time, your crew, chemical costs, redo risk and margin, then click Price this pool.
2. Pure logic is in `calc.mjs` (`plan()`, `visitCost()`, `gallons()`, `encodeShare()`); tests: `node --test`.

Modelled: gallons from dimensions and shape, visit time half fixed and half scaled by volume, plumbing lines, cover work at each end of the season, water condition at opening, crew labour, chemical per 10,000 gallons, supplies, expected redo cost, margin as a share of the price, a minimum charge, a season bundle discount, stops and revenue per crew day, and size sensitivity; a share link. Not modelled: sales tax, licences, insurance, repairs found at opening, leak checks, heater or salt-cell winterizing, freeze damage.
Not legal, tax or financial advice and not winterizing guidance: follow your own procedure and the equipment maker. No warranty; see the page footer. MIT licensed (`LICENSE`).
