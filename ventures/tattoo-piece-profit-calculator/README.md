# Tattoo Piece Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tattoo-piece-profit-calculator/>

Free, browser-only tool for tattoo artists. Enter the hourly take-home you want, your
shop commission or booth rent, setup minutes per session, supplies and free touch-up
time. List the pieces you quote. It shows the lowest price for each, the profit over your
target, what you actually keep per hour of all your time (drawing and setup included), a
shop minimum and a single-session needle-rate ladder. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - piece parsing, hours and cost, lowest price, shop minimum, ladder, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not tax, legal or
licensing advice. It does not model tips, taxes, deposits, no-shows, refunds or shop
contract terms. Unverified against a real business's books: tested on hand-calculated
examples.

MIT licence, see `LICENSE`.
