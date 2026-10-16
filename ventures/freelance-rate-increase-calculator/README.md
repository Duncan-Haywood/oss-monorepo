# Freelance Rate Increase Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-rate-increase-calculator/>

Free, browser-only tool for freelancers and consultants. List your clients with monthly
hours, current rate and your honest chance that each leaves if you raise the rate. It shows
the income change, the hours freed, the share of hours you can lose and still earn the same,
which clients make the raise a bad bet, and the same book at other raises. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - client parsing, break-even loss, per-client and total outcome, raise ladder, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not business, legal or tax
advice. It does not model taxes, ramp-up time for new clients, contract terms, or how a bigger
raise changes the odds a client leaves. Unverified against a real business's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
