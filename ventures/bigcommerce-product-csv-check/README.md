# BigCommerce Product CSV Check

A free browser tool for BigCommerce store owners, agencies and catalogue editors who import
products by CSV: **paste or drop the file and see every problem with its line number before
the import fails or quietly creates products with no price or no variants, then download a
cleaned copy.** The file is read in the browser; nothing is uploaded and no login or API key is
needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bigcommerce-product-csv-check/

After using this, you can now **find the SKU row with no Option Set, the SKU used twice, the
blank price, the `$24.00` the importer rejects, the Y/N flag spelled `yes`, the barcode with a
wrong check digit and the SKU Excel turned into `1.23457E+12`, and get a CSV with the mechanical
faults fixed**, which used to mean an importer error report and a hunt through hundreds of rows.

## Input

A product CSV in BigCommerce's legacy "Item Type" layout (Item Type, Product Name, Product Type,
Product Code/SKU, Option Set, Price ... Product Image File - N, Product URL, GPS columns). Comma,
semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Header names, duplicates and typos; delimiter; unterminated quotes; cell counts per row; Item
Type values; SKU rows attached to a product with an Option Set, option-value format and duplicate
combinations; duplicate SKUs and IDs; Excel damage in SKU and barcode; barcode check digits;
Y/N flags, Product Type, availability, inventory tracking and condition values; prices, weights
and sizes; stock; category paths; custom URLs; image addresses and thumbnails; unbalanced HTML;
encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never
changes the characters of a name, description, SKU, barcode, stock, category or image address.

## Run

Open `index.html` through any static server. Tests: `node --test`.
