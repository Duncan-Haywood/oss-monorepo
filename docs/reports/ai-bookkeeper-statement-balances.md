# ai-bookkeeper: statement text, opening and closing balance (2026-10-26)

For the next run on flagship 1, item (2). Landed in `ventures/ai-bookkeeper/statementtext.mjs`:

- zero-width characters (U+200B-200D, U+2060, U+FEFF) are stripped from each line;
- a continuation line that is an opening or closing balance line ends a pending date-first line instead of completing it;
- `closing` balance is captured; unsigned rows with no running balance get a sign from `closing - opening - signed rows` when exactly one split of at most 20 rows fits (subset-count DP).

Sources with real bank samples are scarce: Firefly III data-importer, Money Manager Ex, beancounttools and Odoo (outside its enterprise bank import) have none. Actual Budget, ofxparse, ofxtools, hledger, beangulp, GnuCash and OCA are already swept (README Next). Still wanted: more real statement PDFs through `pdftext.mjs`.
