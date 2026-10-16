# shopify-customer-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-customer-csv-check/>

Checks a Shopify customer import CSV in the browser before it is imported: emails and duplicates,
phone format, Excel damage to zips and phones, country and province codes, marketing and
tax-exempt values, tag limits and rows with no contact, each with its line number, plus a
safe-fixes pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Shopify's public customer import documentation and listed on the
  page, along with what is not checked. Not affiliated with Shopify.
- Marketing consent must come from real opt-in. The tool checks values and never creates or
  changes consent.
- The file never leaves the browser; a test asserts there are no network calls.
