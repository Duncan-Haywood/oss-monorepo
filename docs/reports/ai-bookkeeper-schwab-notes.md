# ai-bookkeeper: Schwab checking note lines (2026-10-27)

Sweeping jbms/beancount-import's test data (GPL; `git clone --depth 1`, read only) through `readStatement`
found one fault: Schwab's newer checking CSV has no Status column and two one-cell note lines under the
header. Rows read right but the bank was unrecognised and two false "short row" warnings appeared.
Fixed in `bank.mjs` (header pattern + skip non-date one-cell lines); test in `thirdparty.test.mjs`.
Cloning also worked for siddhantgoel/beancount-dkb, beancount-n26 and tarioch/beancounttools; those ship no statement fixtures.
Still open: real exports from the banks in the flagship's `next:` item (2).
