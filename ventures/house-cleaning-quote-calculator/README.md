# House Cleaning Quote Calculator

Free, browser-only tool for residential cleaning business owners. Enter the home,
your own cleaning pace, wages, supplies and drive time, and the frequencies you
sell (one-time, weekly, every two weeks, monthly) with the discount each gets. It
shows the cost of each visit, the lowest price that earns your target margin, the
largest discount each frequency can take, the list price that makes every
discount still clear target, and annual profit by frequency. Nothing is uploaded.

**Live tool:** https://marisstella.app/house-cleaning-quote-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, cost per visit, price floor, discount limits, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax, payroll
or financial advice. It does not model insurance, taxes, cancellations, customer
acquisition cost or employment rules. Unverified against a real company's books:
tested on hand-calculated examples.

FSL-1.1-MIT licence, see `LICENSE`.

## Known gaps

From the quality census of 2026-11-15 ([audit](../../portfolio/quality/audits/2026-11-15-house-cleaning-quote-calculator.json)); the worst defect it found is fixed.

- No overhead or owner-pay input, so margin and profit are before office, software and owner costs.
- Add-ons apply to every visit and their minutes scale with each frequency's time multiplier.
- The structured data lists profit per labor hour, which the page does not show yet.
