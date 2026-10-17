# Rent Increase Notice Checker

Free, private browser tool for small landlords: paste a rent roll with proposed new rents and see, unit by unit, whether the increase is over the state cap (California, Oregon, Washington, New York Good Cause), how many days of notice it needs, and the earliest date the new rent can start. Units that can go out get a plain notice letter to adapt; units that cannot are listed with the reason and the most you can ask. Other states: enter your own notice days.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rent-increase-notice-checker/

Open `index.html`. Tests: `node --test 'ventures/rent-increase-notice-checker/**/*.test.mjs'`.

Not legal advice. The rules table in `calc.mjs` was written from the statutes as read by the author on 2026-10-06 and is unreviewed by a lawyer; local rent-control ordinances are not modelled. See `VENTURE.yaml`.
