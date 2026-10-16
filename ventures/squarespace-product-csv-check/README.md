# Squarespace Product CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/squarespace-product-csv-check/>

A free browser tool for Squarespace store owners, agencies and catalogue editors who import
products by CSV: **paste or drop the file and see every problem with its line number before
the import fails or quietly creates the wrong products, then download a cleaned copy.** The
file is read in the browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **find the variant row that Squarespace would read as a new
product, the SKU used twice, the blank price, the `$24.00` the importer rejects, On Sale with no
Sale Price, the Yes/No flag spelled `yes`, image addresses separated by commas and the SKU Excel
turned into `1.23457E+12`, and get a CSV with the mechanical faults fixed**, which used to mean
an importer error and a hunt through hundreds of rows.

## Input

A product CSV in Squarespace's export layout (Product ID, Variant ID, Product Type, Product Page,
Product URL, Title, Description, SKU, Option Name/Value 1-3, Price, Sale Price, On Sale, Stock,
Categories, Tags, Weight, Length, Width, Height, Visible, Hosted Image URLs). Comma, semicolon
or tab separated; UTF-8 with or without a BOM.

## Checks

Header names, duplicates and typos; delimiter; unterminated quotes; cell counts per row; variant
rows grouped by Product URL; duplicate Product URLs, SKUs and IDs; option names and values and
duplicate combinations; Excel damage in SKUs; Product Type values; prices, sale price and On
Sale; weights and sizes; stock; Yes/No flags; Hosted Image URLs; unbalanced HTML; encoding.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never
changes the characters of a title, description, SKU, category, tag, option value or image address.

## Run

Open `index.html` through any static server. Tests: `node --test`.
