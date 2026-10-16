# shopify-inventory-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-inventory-csv-check/>

Checks a Shopify inventory import CSV in the browser before it is imported: the `On hand (new)` column,
quantities that are text, fractions or have a thousands comma, tenfold jumps, duplicate variant-and-location
rows, malformed handles, locations spelled two ways and Excel-damaged SKUs, each with its line number, plus a
safe-fixes pass that only touches formatting and never a quantity's value.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Shopify's public help pages and listed on the page, along with what is not
  checked. Not affiliated with Shopify.
- The file never leaves the browser; a test asserts there are no network calls.
