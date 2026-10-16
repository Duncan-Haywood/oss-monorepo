# Vendor Contract Clause Reader

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/vendor-contract-clause-reader/>

Free, private browser tool: paste a SaaS or vendor agreement and get the key terms with the sentence each came from, the auto-renewal cancel-by date (downloads as `.ics` with a 30-day alarm), the price schedule including what a missed deadline commits you to, and the clauses buyers usually negotiate (list-price renewals, vendor-changes-terms-at-will, no exit, liability cap and carve-outs, one-way indemnity, missing data terms).

Open `index.html`. Tests: `node --test 'ventures/vendor-contract-clause-reader/**/*.test.mjs'`.

Not legal advice. It reads wording with fixed rules, can miss or mis-read terms, and does not decide fairness or enforceability. See `VENTURE.yaml`.
