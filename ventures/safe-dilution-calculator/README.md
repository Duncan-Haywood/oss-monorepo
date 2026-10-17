# SAFE Dilution Calculator

A free browser tool for startup founders. Enter your cap table, your SAFEs
and the priced round you expect; it converts the SAFEs, sizes the option
pool top-up and shows what you own afterwards. Entirely client-side; nothing
is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/safe-dilution-calculator/

After using this, you can now **see your cap table after the round, what each
SAFE cost you and what founders take home at an exit**, which used to take a
spreadsheet that has to solve three circular formulas or a cap table product
that wants an account.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies.

- `solveRound` converts every SAFE at one priced round. The price per share,
  the shares each SAFE becomes and the pool top-up depend on each other, so it
  iterates to a fixed point and returns an error instead of a half-answer if it
  cannot settle or if post-money SAFEs claim 100% or more of the company.
- Post-money SAFE: cap price = cap / (all shares + pool + every SAFE's shares),
  excluding the round's own pool top-up. Pre-money SAFE: cap / (shares + pool),
  SAFEs excluded. Discount price = round price x (1 - discount). A SAFE
  converts at the lowest applicable price and never above the round price.
- Round price = pre-money / (existing shares + SAFE shares + pool top-up).
- `valuationSweep` re-solves at other pre-money valuations.
- `followOnRound` applies a later round to the resulting cap table.
- `exitWaterfall` treats every preferred class as 1x (new investors: your
  multiple) non-participating and pari passu; each takes its preference or
  converts, whichever pays more.

Tested against the published Y Combinator post-money example ($1M at a $10M cap
on 10M shares converts to 1,111,111 shares), the identity
`price x total shares = pre-money + raise`, exact pool targets, waterfall
totals, and a convergence grid.

## What this does not cover

One priced round only; no convertible notes, warrants, pro rata rights, MFN
clauses, side letters, participating preferred, senior series, anti-dilution or
option strike prices. It is a planning aid, not a cap table system and not legal
advice. Have your startup lawyer check the real numbers.

## Run the tests

```
node --test
```
