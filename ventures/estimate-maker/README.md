# Estimate Maker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/estimate-maker/>

After using this, you can send a clear estimate with good, better and best
options in two minutes, which used to mean a paid field-service app or a Word
template, and see which of your estimates you actually win.

Free, no account, no watermark, works offline. Everything runs in your browser;
estimates are stored in `localStorage` on your device and never uploaded.

- One to three options per estimate, each with its own lines; optional add-ons priced separately and kept out of the total
- Tax on taxable lines, a discount applied before tax, a deposit as percent or flat amount, a valid-until date, scope and a signature block
- Print or save as PDF (print stylesheet shows only the estimate)
- Sales view: draft / sent / won / lost / expired, win rate on decided estimates, open pipeline, and sent estimates that have gone quiet
- "To invoice" on a won estimate downloads a file that restores into [Invoice Maker](../invoice-maker/)
- All money maths in integer cents (`calc.mjs`); CSV and JSON export

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
