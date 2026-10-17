# Massage Therapist Profit Calculator

Free, browser-only tool for massage therapists and small practice owners. List
your session types with price, minutes, supplies and sessions per week, plus your
overhead and no-show rate. It shows profit per hour for each session after card
fees, no-shows and overhead, the price that hits your hourly target, your week as
own practice versus room rent versus employee split, and how many clients you can
lose before a price raise costs money. No client or health information is needed;
nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/massage-therapist-profit-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, per-session profit, price floor, no-show adjustment, model comparison, raise break-even, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax or
financial advice. It does not model payroll or self-employment tax, benefits,
licensing, rebooking freed hours or local market prices. Unverified against a real
practice's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
