# EU CSRD Scope Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eu-csrd-scope-checker/>

Free, private browser tool: enter headcount, turnover, balance sheet and company type to see whether a company must report sustainability information under the CSRD (Directive (EU) 2022/2464), under the original thresholds and under the Omnibus thresholds (more than 1,000 employees and more than EUR 450M turnover) side by side, from which financial year, and what to do if you are only hit by customer and bank data requests (the VSME route).

After using this, you know whether to start a double-materiality assessment or just prepare one VSME data set, which used to take a call with an adviser.

Open `index.html`. Tests: `node --test 'ventures/eu-csrd-scope-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.
