# wix-product-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wix-product-csv-check/>

Checks a Wix Stores product CSV in the browser before it is imported: Product and Variant row
structure, option choices, name length, price, inventory, discounts, image links, SKUs and Excel
damage, each with its line number, plus a safe-fixes pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Wix's public product import documentation and listed on the page,
  along with what is not checked. Not affiliated with Wix.
- The file never leaves the browser; a test asserts there are no network calls.
