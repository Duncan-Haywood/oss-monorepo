# Payment Processor Fee Comparison Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/payment-processor-fee-comparison-calculator/>

A free browser tool for small merchants, market vendors, food trucks, salons and online sellers: **enter your monthly card sales, your average sale and each
processor's quote, and see the monthly bill, the yearly bill and the effective rate on your sales**, plus how that rate moves as your average sale shrinks or
grows. Nothing is uploaded.

After using this, you can now **compare flat-rate, interchange-plus and subscription quotes on the same footing**, which used to be reading three pricing
pages and guessing how a 30-cent fixed fee behaves on a $6 coffee.

## Use

1. Open `index.html`, enter sales, average sale, online share, refunds and disputes, then one processor per line
   (`name, in-person %, in-person fixed $, online %, online fixed $, monthly $, dispute fee $, keeps|returns`), click Calculate the cost.
2. Pure logic is in `calc.mjs` (`plan()`, `costOf()`); tests: `node --test`.

Modelled: percentage and fixed fees split by in-person/online, monthly fee, dispute fees, refund-fee policy, effective rate, yearly cost, sensitivity to
average sale. Not modelled: per-card interchange, PCI and add-on fees, payout and currency fees, hardware, taxes. Not financial advice.
No warranty; see the page footer. MIT licensed (`LICENSE`).
