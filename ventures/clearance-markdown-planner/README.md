# Clearance Markdown Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/clearance-markdown-planner/>

Free browser tool for retailers and online sellers with stock they need to clear
before a deadline. Enter the units left, the weeks left, and what a leftover unit
is worth; paste recent `date, price, units` rows and the tool measures how your
buyers respond to price (log-log regression with a time-trend control, shrunk toward
a typical retail value) and plans the week-by-week markdown that maximises expected
revenue plus salvage, using a stochastic dynamic program over weeks, stock and price
level.

**After using this, you can now** know which week to cut price and by how much, and
what to do if you fall behind or get ahead, **which used to be** a guess at a
round-number discount near the end of the season.

- Shows the plan against simple rules (hold, one cut, fixed ladder, half off at the
  midpoint), evaluated exactly by the same recursion.
- A "behind / ahead of plan" table you can read each Monday.
- A simulated range of outcomes and the share of seasons with stock left over.
- A robustness table: what the plan loses if the elasticity is actually at either
  end of its 80% range.

**No warranty.** Free and as-is; a statistical plan from the figures you supply, not
legal, tax or financial advice. Your data never leaves the browser tab.

Unverified against a published retailer dataset or a commercial pricing tool; unit
tests use simulated histories with a known elasticity and closed-form one-week cases.
Not modelled: competitor prices, reordering, cannibalisation, buyers who wait for the
next cut, price points.

Run the tests: `node --test` in this directory. Open `index.html` through any static
server (ES modules need http, not file://).

MIT licensed. See `LICENSE`.
