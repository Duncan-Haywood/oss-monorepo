# Course Launch Revenue Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/course-launch-revenue-calculator/>

Free, browser-only tool for creators selling an online course. Enter your email list, the share who
visit the sales page and buy, your price, refunds, platform and processor fees, affiliate commissions
and ad spend. It shows the net profit, where the money goes, the list size where the launch breaks
even, the return on ad spend and what a weaker or stronger launch earns. Nothing is uploaded.

After using this, you can tell whether a launch covers its costs, and how big a list or how much
conversion you need, before you spend on ads or build the course. That used to take a spreadsheet.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - buyers, per-buyer net after refunds and fees, break-even, scenarios, price table, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not business, legal or tax
advice. It does not model taxes, payment plans, upsells, your time, or how price changes conversion.
Unverified against a real launch's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
