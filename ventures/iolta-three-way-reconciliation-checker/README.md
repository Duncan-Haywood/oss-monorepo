# IOLTA three-way reconciliation checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/iolta-three-way-reconciliation-checker/>

Free, private browser tool for solo and small-firm lawyers: paste the month's trust journal and the bank statement balance to check the adjusted bank balance against the journal and the client ledgers, and to catch negative client balances, payments made before a deposit cleared, firm money left in trust, stale checks, duplicates and dormant balances.

After using this, a lawyer can see in a minute whether the trust account reconciles and where the difference is, which used to mean an evening with a spreadsheet and a bank statement.

Open `index.html`. Tests: `node --test 'ventures/iolta-three-way-reconciliation-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal or accounting advice. It checks arithmetic, not your jurisdiction's compliance. See `VENTURE.yaml`.
