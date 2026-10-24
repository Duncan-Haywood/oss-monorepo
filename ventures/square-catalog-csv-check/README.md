# Square Catalog CSV Check

A free browser tool for Square sellers, bookkeepers and agencies who load an item library by CSV:
**paste or drop the file and see every problem with its line number before the import fails or
quietly creates duplicate items, then download a cleaned copy.** The file is read in the browser;
nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/square-catalog-csv-check/

After using this, you can now **find the Token Excel damaged, the SKU used twice, two variations
with the same name, the Price written $24,00, the Archived column filled with "yes", the barcode
with a wrong check digit and the SKU turned into `1.23457E+12`, and get a CSV with the mechanical
faults fixed**, which used to mean an import error summary and a hunt through hundreds of rows.

## Input

An item library CSV in Square's import layout (Token, Item Name, Variation Name, SKU, Category,
GTIN, Price, Online Sale Price, Archived, Sellable, Stockable, Option Name/Value N, per-location
quantity columns, Tax - columns). Comma, semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Header names and duplicates; delimiter; unterminated quotes; cell counts per row; Token shape,
repeats and Excel damage; duplicate SKUs; GTIN check digits; Y/N columns and Tax - columns;
prices, sale prices and per-location prices; weights; quantities and stock-alert counts; stockable
conflicts; multi-variation items (variation names, duplicates, option name/value pairs, repeated
option combinations); category disagreement; permalinks; SEO lengths; encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never edits
an item name, variation name, description, SKU, token, barcode, quantity or category.

## Run

Open `index.html` through any static server. Tests: `node --test`.
