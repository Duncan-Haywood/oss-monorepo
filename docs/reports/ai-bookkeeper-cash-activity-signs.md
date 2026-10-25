# ai-bookkeeper: sign inference on brokerage cash-activity files (2026-10-25)

For the next run. `readStatement` in `ventures/ai-bookkeeper/bank.mjs` flips
signs for a trade list only when quantity and amount agree in sign (`tradeSignsAgree`).
Found by running beangulp's `file_type_testdata/example.csv` through the reader.
Other sample sources worth the same sweep: beancounttools (cloned, no data files
found), firefly-iii/data-importer. HCB and irs.gov were 403 through the proxy
today; the 2027 IRS revenue procedure was still unpublished (search, 2026-10-25).
