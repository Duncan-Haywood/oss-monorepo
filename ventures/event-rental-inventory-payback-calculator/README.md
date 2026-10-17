# Event Rental Inventory Payback Calculator

Free, browser-only calculator for party, tent and event rental companies deciding what to buy
next. List each item (chairs, tables, linens, dance floor) with units owned, cost, price per
rental, rentals per unit a year, handling per rental, yearly loss and damage, storage and
useful life. It shows **payback, yearly return on the money tied up and break-even rentals per
unit** for every item, **ranks the inventory**, and finds the **lowest rental price** that pays
an item back within the years you choose.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/event-rental-inventory-payback-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - per-item economics, ranking, minimum price, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `which-rental-items-pay-for-themselves.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any rental software or equipment maker. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
