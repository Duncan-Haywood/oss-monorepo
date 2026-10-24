# Finance: books, pricing maths, cash and tax set-aside

Owns `finance/`. Bookkeeping and analysis, not accounting or tax advice: an
accountant the owner chooses signs off on anything filed. Runs never move
money (see `GUARDRAILS.md`).

## Files

- `finance/ledger.csv`: double-entry books, one posting per row
  (`python3 ops/books.py check | pnl --month YYYY-MM | balance`). Every row
  names its source document. Statements and receipts themselves stay out of
  git; the owner drops exports in the place `finance/README.md` names.
- `finance/costs.md`: every recurring cost (hosting, tools, fees) with a link
  to the pricing page and the date checked.
- `finance/model.md`: unit economics: price, payment-processor fees, cost to
  serve one customer, break-even customer count. Formulas shown, inputs
  sourced.
- `finance/close/YYYY-MM.md`: the monthly close: P&L from `books.py`, cash,
  runway, what changed, the tax to set aside and how it was estimated.

## Each run, pick the highest-value item that is not done

1. A month has ended and has no close file: write it.
2. New statement exports exist: post them to the ledger and run the check.
3. The unit-economics model is missing or out of date with `sales/pricing.md`.
4. A compliance calendar in `finance/calendar.md`: tax and filing dates for
   the region in `BUSINESS.md`, each with a source link, mirrored into
   `OWNER.md` a week before each one is due.

## Rules

- Never estimate a figure into the ledger. If a source is missing, ask for it
  in `OWNER.md`.
- Show uncertainty: a tax set-aside is a range with its assumptions.
