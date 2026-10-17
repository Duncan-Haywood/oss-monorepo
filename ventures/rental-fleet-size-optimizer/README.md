# Rental Fleet Size Optimizer

Free, browser-only tool for businesses that rent out identical units: party
tents, kayaks, scaffold sets, camera bodies, tool kits. Enter your seasons of
demand, how long rentals last, what you charge and what a unit costs to own. It
computes the yearly profit of every fleet size from one upward, two ways (the
Erlang loss formula and a repeatable day-by-day simulation), and recommends how
many units to own, with the share of customers turned away, a bad year, an
optional turn-away cap, and how the answer moves if demand does. Nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rental-fleet-size-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, Erlang B, the closed-form yearly figures, a seeded
  random-number generator (Poisson and negative binomial), the day-by-day
  simulation with common random numbers across fleet sizes, and the optimizer.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-many-rental-units-to-own.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; arithmetic and simulation on figures you type,
not legal, tax, financial or business advice. It treats units as identical and
does not model damage, repairs, deposits, delivery, staff, taxes, financing or
resale value. Unverified against a real rental business's books: tested against
hand-calculated Erlang values, an exact one-day-rental formula and a seeded
simulation.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
