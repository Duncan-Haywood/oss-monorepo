# WooCommerce Product CSV Check

A free browser tool for WooCommerce store owners, agencies and catalogue editors who import
products by CSV: **paste or drop the file and see every problem with its line number before
the import fails or quietly creates orphaned variations, then download a cleaned copy.** The
file is read in the browser; nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/woocommerce-product-csv-check/

After using this, you can now **find the variation whose Parent matches no row, the SKU used
twice, the sale price above the regular price, the date written 27/11/2026, the barcode with a
wrong check digit and the SKU Excel turned into `1.23457E+12`, and get a CSV with the
mechanical faults fixed**, which used to mean an importer error log and a hunt through hundreds
of rows.

## Input

A product CSV in the WooCommerce importer's layout (ID, Type, SKU, Name, Published, ... Position,
Attribute N columns, Meta: columns). Comma, semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Header names and duplicates; delimiter; unterminated quotes; cell counts per row; Type values;
Parent links (present, above, variable, attribute names and values, duplicate variations);
variable products without attributes or variations; duplicate SKUs and IDs; Excel damage in SKU
and GTIN; GTIN check digits; Published, visibility, tax status, backorder and 1/0 flags; stock;
weight and size columns; sale dates; prices; images; categories; external URLs; unbalanced HTML;
encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never
edits a name, description, SKU, barcode, stock, category or image address.

## Run

Open `index.html` through any static server. Tests: `node --test`.
