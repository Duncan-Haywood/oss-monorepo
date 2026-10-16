# Wedding Photographer Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wedding-photographer-profit-calculator/>

Free, browser-only tool for wedding and event photographers. List your packages
with price, coverage hours and job costs, plus your overhead. It counts travel,
client time and culling and editing on every job, then shows profit per hour
actually worked next to the headline rate per coverage hour, the price that hits
your hourly target, how your own clients, a lead marketplace and shooting for a
studio compare, and how many clients you can lose before a price raise costs
money. No client or event details are needed; nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-package profit with editing hours, price floor, model comparison, raise break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model payroll or self-employment tax, retainers and
cancellations, album and print sales beyond the per-job cost you enter,
seasonality, the extra bookings a marketplace or studio may send, or local market
prices. Unverified against a real photographer's books: tested on hand-calculated
examples.

MIT licence, see `LICENSE`.
