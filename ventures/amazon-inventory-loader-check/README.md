# amazon-inventory-loader-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/amazon-inventory-loader-check/>

Checks an Amazon Seller Central inventory file in the browser before it is uploaded: tab-delimited
format, SKUs, product ids with UPC/EAN/ISBN check digits, prices, quantities, add-delete codes,
conditions and notes, each with its line number, plus a safe-fixes pass that only touches
formatting (and restores a UPC's leading zero only when the check digit confirms it).

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Amazon's public inventory file documentation and listed on the
  page, along with what is not checked. Not affiliated with Amazon.
- The file never leaves the browser; a test asserts there are no network calls.
