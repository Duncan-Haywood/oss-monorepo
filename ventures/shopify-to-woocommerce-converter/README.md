# Shopify to WooCommerce Product Converter

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-to-woocommerce-converter/>

A free browser tool for store owners and agencies moving a catalogue from Shopify to
WooCommerce: **paste or drop Shopify's product export CSV and download a WooCommerce product
import CSV**, with every note about what could not be carried across. The file is read in the
browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **import a Shopify catalogue into WooCommerce with its variants
as variable products and variations, Compare At Prices as sale prices, stock, weights, tags and
images intact**, which used to mean rebuilding the file by hand in a spreadsheet or paying for a
migration plugin.

## Mapping

Title to Name; Body (HTML) to Description; Type (else Product Category) to Categories; Tags to
Tags; Image Src rows to Images in position order. More than one variant makes a `variable`
parent (SKU = handle in capitals, or `-PARENT` if a variant already uses it) and one
`variation` row per variant; Option names become attributes. Variant Price is the Regular
price, unless Compare At Price is higher, in which case Compare At is the Regular price and
Variant Price the Sale price. Tracked quantities become Stock and In stock?; "continue selling"
becomes Backorders allowed; grams become kilograms. Missing or repeated variant SKUs get a
generated unique SKU and a note. Draft and archived products become drafts.

Not converted (listed on the page): Vendor, SEO fields, cost per item, gift cards, metafields,
Google Shopping columns, collections.

## Run

Open `index.html` through any static server. Tests: `node --test`.
