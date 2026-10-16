# ABA Authorization Tracker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/aba-authorization-tracker/>

Free, private browser tool for ABA therapy practices: paste an authorization list (client, CPT code, units approved, start, end, units used) and see which authorizations will run out of units early, which will expire unused (priced at your rate per unit), and when each reauthorization should be submitted. Downloads a CSV report.

Open `index.html`. Tests: `node --test 'ventures/aba-authorization-tracker/**/*.test.mjs'`.

Not billing, clinical or legal advice. It does arithmetic on your numbers and does not know any payer's rules. Use initials, not names. See `VENTURE.yaml`.
