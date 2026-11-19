# Small Business Acquisition Calculator

Free, private browser tool for people buying a small business: enter the asking price, SDE and financing (down payment, bank or SBA loan, seller note) and see DSCR, cash needed at close, what the business pays you after debt, the highest price that still clears a lender's coverage floor, and a sensitivity table for falling earnings.

**Live tool:** https://marisstella.app/small-business-acquisition-calculator/

Open `index.html`. Tests: `node --test 'ventures/small-business-acquisition-calculator/**/*.test.mjs'`.

## Known gaps (quality audit 2026-11-19)

The [audit](../../portfolio/quality/audits/2026-11-19-small-business-acquisition-calculator.json) reproduced the loan maths but found it departs from SBA SOP 50 10 8.1 in three places a lender would catch: a seller note on full standby still has its payments taken out of year-one cash (SBA allows none during the loan term); the upfront SBA guaranty fee is not modelled (3.5% of the guaranteed share on the sample loan, about $25,200, usually financed); and the equity check uses 10% of price rather than of total project cost and ignores that a standby note may supply half. Fixed in the audit's PR: inputs such as `90k` are now rejected instead of read as 90, and tests pin the sensitivity table and cash-on-cash figures.

Not financial advice. Does not value the business or know any lender's rules. See `VENTURE.yaml`.
