# ADU Payback Calculator

Free, browser-only calculator for homeowners and small builders weighing an
accessory dwelling unit (ADU, granny flat, backyard cottage). Enter the build
cost lines, financing, rent and operating costs. It shows year-1 cash flow, yield
on cost, simple payback, equity IRR and NPV over your hold period (with an
optional appraised value uplift at sale), the rent you need to break even, and
how the result moves with rent and build cost. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/adu-payback-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, loan maths, year-by-year projection, IRR/NPV, sensitivities, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not investment,
tax, legal or construction advice. It models no market data, tax effects, local
rules, or construction risk. Unverified against a real project: tested on
hand-calculated examples.

MIT licence, see `LICENSE`.
