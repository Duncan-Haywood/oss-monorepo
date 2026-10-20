# Sales Export To Journal

Free browser tool: drop any Airbnb, Amazon, eBay, Etsy, Gumroad, YouTube AdSense, PayPal, Shopify, Square or Stripe
sales or payout export and it works out which platform wrote the file, proves the rows add up to the
payout, splits sales, shipping, tax, fees and refunds, and downloads balanced month-split journals
for Xero, QuickBooks Online and QuickBooks Desktop (IIF). One front door for seventeen single-platform
journal tools (Ko-fi, Buy Me a Coffee and Teachable share one export layout, as do Patreon and Lemon
Squeezy); the file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sales-export-to-journal/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/sales-export-to-journal/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
