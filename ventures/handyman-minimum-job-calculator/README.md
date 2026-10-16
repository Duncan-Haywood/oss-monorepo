# Handyman Minimum Job Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/handyman-minimum-job-calculator/>

Free, browser-only tool for handymen and small repair businesses. Enter the hourly
pay you want for your own time, monthly overhead, and the drive, estimate and
supply-run time every call costs. It shows the minimum trip charge, the smallest job
worth driving to at your quoted hourly rate, the lowest price for each job you list,
and the hourly rate you actually keep once unpaid time is counted. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - job parsing, trip cost, price floor, minimum job size, effective hourly, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax, legal or
licensing advice. It does not model taxes, permits, callbacks, unpaid invoices or
local rules on unlicensed work. Unverified against a real business's books: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
