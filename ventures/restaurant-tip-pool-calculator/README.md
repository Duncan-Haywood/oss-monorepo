# Restaurant Tip Pool Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/restaurant-tip-pool-calculator/>

Free, private browser tool for restaurants, cafes and bars: paste a shift list (name, role, hours, tips, sales) and see what each person receives under a shared pool by hours, a role-points pool, or a server tip-out. Handles the card fee, excludes owners and managers, flags kitchen staff, and downloads a payroll CSV. Payouts always add up to the pool to the cent.

Open `index.html`. Tests: `node --test 'ventures/restaurant-tip-pool-calculator/**/*.test.mjs'`.

Not legal or payroll advice. Tip rules differ by state; it does the arithmetic, not the compliance. See `VENTURE.yaml`.
