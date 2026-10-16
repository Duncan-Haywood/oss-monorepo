# DJ Gig Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dj-gig-profit-calculator/>

Free, browser-only tool for mobile DJs and event entertainers. List your
packages with price, event hours, gig costs and gigs per month, plus your
overhead. It shows profit per hour worked once setup, travel and planning are
counted, the price that hits your hourly target, how direct clients, a lead
marketplace and an agency subcontract compare, and how many clients you can lose
before a price raise costs money. No client or event details are needed; nothing
is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-package profit, price floor, model comparison, raise break-even, CSV.
- `quote.mjs` - quote builder: bottom-up price for one gig (add-ons, unpaid hours, gear wear, mileage, insurance and software share, fees, second operator, overtime), effective hourly, break-even and target price, deposit schedule, good/better/best ladder, and the price per gig that reaches an annual income goal with a peak and off-season split.
- `how-much-should-a-wedding-dj-charge.html` - guide with worked numbers that `quote.test.mjs` ties to the engine.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model payroll or self-employment tax, deposits and
cancellations, seasonality, the extra bookings a marketplace or agency may send,
or local market prices. The quote builder's defaults are invented round numbers. Unverified against a real DJ's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
