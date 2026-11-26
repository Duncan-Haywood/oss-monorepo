# Wix Product CSV Check — Find Store Import Errors Before You Import

Checks a Wix Stores product CSV in the browser before it is imported: Product and Variant row
structure, option choices, name length, price, inventory, discounts, image links, SKUs and Excel
damage, each with its line number, plus a safe-fixes pass that only touches formatting.

**Live tool:** https://marisstella.app/wix-product-csv-check/

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Wix's public product import documentation and listed on the page,
  along with what is not checked. Not affiliated with Wix.
- The file never leaves the browser; a test asserts there are no network calls.

## Known gaps

From quality audit round 111
([`portfolio/quality/audits/2026-11-26-wix-product-csv-check.json`](../../portfolio/quality/audits/2026-11-26-wix-product-csv-check.json)):

- The rules follow Wix's older product template. Wix's current help pages describe a newer catalogue
  template (fieldType `PRODUCT`, `VARIANT` or `MEDIA`, case sensitive; inventory `in_stock` /
  `out_of_stock`). The checker reports `MEDIA` rows and `in_stock` as errors. The safe-fixes pass no
  longer rewrites upper-case `PRODUCT`/`VARIANT` (fixed in round 111), but full support for the new
  template needs Wix's pages read directly (they were not reachable from the audit session).
- Not checked: 15 images per product, the 8,000-character description limit, image file types.
- Two seeded mutations survived: the percent-discount cap (`> 100` vs `>= 100`) and the variant limit.
