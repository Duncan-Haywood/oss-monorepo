# etsy-listing-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/etsy-listing-csv-check/>

Checks an Etsy bulk listing CSV in the browser before it is uploaded: title length, tag count and
length, price, currency, quantity, image links, variation values, SKUs and Excel damage, each with
its line number, plus a safe-fixes pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Etsy's public bulk listing documentation and listed on the page,
  along with what is not checked. Not affiliated with Etsy.
- The file never leaves the browser; a test asserts there are no network calls.
