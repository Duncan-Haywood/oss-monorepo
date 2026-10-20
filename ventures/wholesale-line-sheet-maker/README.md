# Wholesale Line Sheet Maker

After using this, you can send a boutique a professional priced line sheet and
know your margin at wholesale, which used to take an evening in a spreadsheet.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/wholesale-line-sheet-maker/

Free, no account, no watermark, works offline. Everything runs in your browser;
products are stored in `localStorage` on your device and never uploaded.

- Product table: name, SKU, unit cost (materials + labor), MSRP, case pack, optional per-product wholesale override; CSV paste/import and export, JSON backup
- Wholesale price from keystone (50% of MSRP), a target gross margin, or a multiplier on cost; rounding to $1.00 / $0.50 / $x.95
- Retailer margin (keystone check), your margin, and your margin after an optional marketplace commission you type in (no claim about any marketplace's terms)
- Volume tier discounts, order minimums (dollars and units), case-pack rounding, flags for below-cost, low retailer margin and below-target margin
- Order simulator and a "what order clears $X profit" solver
- Print-ready line sheet (brand, contact, terms) and line-sheet CSV, which never include your cost or margins
- All money maths in integer cents (`calc.mjs`)

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
