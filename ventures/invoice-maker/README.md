# Invoice Maker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/invoice-maker/>

After using this, you can send a complete, professional invoice in two minutes,
which used to mean a paid invoicing app or a spreadsheet template, and see which
of your invoices are overdue and how old the unpaid balance is.

Free, no account, no watermark, works offline. Everything runs in your browser;
invoices are stored in `localStorage` on your device and never uploaded.

- Itemised lines, one tax rate with per-line taxable flag, percent or flat discount (before tax), shipping, deposits and part payments
- Payment terms (due on receipt, net 7-60, custom), due date computed from the issue date, late-fee clause printed in the terms
- Print or save as PDF (print stylesheet shows only the invoice)
- Completeness check: number, business name, client, due date, payment instructions, duplicate numbers
- Receivables: draft / sent / partial / paid / overdue, aging buckets, CSV and JSON export
- All money maths in integer cents (`calc.mjs`)

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
