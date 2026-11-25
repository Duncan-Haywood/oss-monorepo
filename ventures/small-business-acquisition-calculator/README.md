# Small Business Acquisition Calculator

Free, private browser tool for people buying a small business: enter the asking price, SDE and financing (down payment, bank or SBA loan, seller note) and see DSCR, cash needed at close, what the business pays you after debt, the highest price that still clears a lender's coverage floor, and a sensitivity table for falling earnings.

**Live tool:** https://marisstella.app/small-business-acquisition-calculator/

Open `index.html`. Tests: `node --test 'ventures/small-business-acquisition-calculator/**/*.test.mjs'`.

## SBA rules it applies (reviewed 2026-11-25)

- **Full-standby seller note:** no principal or interest while the bank/SBA loan runs (SOP 50 10 8 and 8.1), so its
  payments are left out of the DSCR *and* out of year-one cash; the page shows the yearly payment once the bank loan is
  paid, assuming interest accrues at the note rate meanwhile.
- **Equity injection:** at least 10% of total project cost (price, closing costs, working capital) for a change of
  ownership; a full-standby note may supply up to half.
- **Warnings:** a DSCR floor under 1.25 (the SOP 50 10 8.1 minimum for an initial acquisition or owner buyout), and a
  bank loan over the $5,000,000 7(a) maximum.

The SOP text itself was not reachable from the session that made these changes; they follow secondary summaries by
lenders and law firms, and the page tells users to confirm with a lender.

## Known gaps (quality audit 2026-11-19)

The [audit](../../portfolio/quality/audits/2026-11-19-small-business-acquisition-calculator.json) found three
departures from SBA practice. Two are fixed (the standby treatment and the equity check, above). Still open: the
upfront SBA guaranty fee is not modelled (a percentage of the guaranteed share, usually financed, which raises the loan
and its debt service); users type it into closing costs, which counts it as cash. The SOP 50 10 8.1 quality-of-earnings
requirement for larger deals is not flagged either.

Not financial advice. Does not value the business or know any lender's rules. See `VENTURE.yaml`.
