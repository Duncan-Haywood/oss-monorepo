# Insurance Commission Reconciler

Free, private browser tool for independent insurance agencies: load your policy book and the commission statements your carriers sent, and it finds the money that did not arrive. Policies that never appeared on a statement, commission paid at a lower rate than your agreement, chargebacks on policies your book shows in force, lines paid twice (a chargeback waiting to happen), a rate that differs from what the same carrier pays you on every other policy of that line, and statements whose own total does not match their lines. It writes one review request per carrier, worded as a question, and downloads the findings as CSV.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/insurance-commission-reconciler/

Open `index.html`. Tests: `node --test 'ventures/insurance-commission-reconciler/**/*.test.mjs'`.

Not insurance, legal or accounting advice. The rate used is the rate you type or export; the carrier's records and your producer agreement decide what is owed. Column names are alias-matched and have not been run against a real agency-management export or carrier statement. See `VENTURE.yaml`.
