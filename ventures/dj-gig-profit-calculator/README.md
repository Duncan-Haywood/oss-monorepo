# DJ Gig Profit Calculator

Free, browser-only tool for mobile DJs and event entertainers. List your
packages with price, event hours, gig costs and gigs per month, plus your
overhead. It shows profit per hour worked once setup, travel and planning are
counted, the price that hits your hourly target, how direct clients, a lead
marketplace and an agency subcontract compare, and how many clients you can lose
before a price raise costs money. No client or event details are needed; nothing
is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-package profit, price floor, model comparison, raise break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model payroll or self-employment tax, deposits and
cancellations, seasonality, the extra bookings a marketplace or agency may send,
or local market prices. Unverified against a real DJ's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
