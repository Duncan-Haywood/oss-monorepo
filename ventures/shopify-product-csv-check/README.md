# Shopify Product CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-product-csv-check/>

A free browser tool for Shopify merchants, agencies and catalogue editors who import
products by CSV: **paste or drop the file and see every problem with its line number before
the import fails or quietly creates the wrong products, then download a cleaned copy.** The
file is read in the browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **find the variant row that repeats an option combination, the
price that says `$24.00`, the barcode with a wrong check digit, the SKU Excel turned into
`1.23457E+12`, and the product whose rows got split, and get a CSV with the mechanical faults
fixed**, which used to mean an import error email and a hunt through hundreds of rows.

## Input

A product CSV in Shopify's template layout (Handle, Title, Body (HTML), ... Status). Comma,
semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Header names and duplicates; delimiter; unterminated quotes; cell counts per row; Handle
blank, form, grouping and length; Title; option names and values, repeated variants, three
option limit; prices, compare-at, cost; SKU duplicates and Excel damage; GTIN check digits;
grams and weight unit; inventory tracker, quantity and policy; TRUE/FALSE flags and Status;
image URLs, positions and repeats; tags; SEO lengths; unbalanced HTML in the body; encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never
edits a title, description, SKU, barcode, quantity or image address.

## Run

Open `index.html` through any static server. Tests: `node --test`.
