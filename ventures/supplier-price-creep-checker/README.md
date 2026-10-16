# Supplier Price Creep Checker

Free, private browser tool for restaurants, cafes and small shops: paste supplier invoice lines (date, item, quantity, unit price, optional contract price) and see which items crept up, which single invoice was a one-off overcharge, which lines are over the contract price, what the move costs over a year, and a price index per supplier. Downloads a credit-request email per supplier and a CSV report.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/supplier-price-creep-checker/

Open `index.html`. Tests: `node --test 'ventures/supplier-price-creep-checker/**/*.test.mjs'`.

Not accounting or legal advice. It compares the prices you give it; it cannot say whether a rise was justified or a credit is owed. See `VENTURE.yaml`.
