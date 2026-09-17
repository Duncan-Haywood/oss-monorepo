# StockX Seller Payout Calculator

StockX sneaker, streetwear, and card resellers can use this free browser-local calculator to find real net payout and net profit for one sale — after the seller fee (which drops by Seller Level), the Fast Shipping discount, the payment processing fee, and outbound shipping cost — then roll a list of sales up into monthly profit and check it against a profit goal. **After using this, you can tell whether a sale actually paid, which used to take a spreadsheet and a guess about whether your seller-fee rate was still the one you typed in last time your level changed.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the sale price is the wrong number to judge a flip by

A pair that "sold for $150" can land a lot less in your account once the real deductions come out — deductions that are not the same for every seller:

- **Seller fee, scaled by Seller Level.** StockX's transaction fee percentage drops as your completed-sale count and account history improve, so two sellers moving the identical item at the identical price can keep different amounts.
- **Fast Shipping discount** knocks a further percentage off the seller-level rate for sellers shipping from pre-verified local inventory — it stacks with the level rate rather than replacing it.
- **Payment processing fee** is a flat percentage of the sale price, charged the same regardless of seller level.
- **Shipping to the verification center** is closer to a flat dollar cost than a percentage, so it eats a much bigger share of a cheap item's payout than an expensive one's.

The month section then answers the question one sale's profit can't: given your actual sales this month, does it hit your profit goal, and if not, how many more sales at the same average profit close the gap?

This tool deliberately does not verify authenticity, track inventory, or read StockX's live fee schedule — those are StockX's own systems and your own seller dashboard. It only prices the payout and profit arithmetic of a sale you already made or are considering, from numbers you supply.

## Privacy and usage

Everything runs in your browser. Your sale figures and month list are never uploaded, there is no account, and nothing is saved when you close the tab — the month table clears on refresh by design. We count anonymous local feature events only (`sale-priced`, `month-check`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No sale prices, items, or profit figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. It is also not an authentication, inventory, or sourcing tool of any kind — it never verifies an item, tracks stock, or replaces your own StockX seller dashboard and payout statements. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, confirm a payout amount, or replace your own accountant. StockX is a trademark of StockX LLC, named here only to describe what this tool calculates — this tool is not affiliated with, endorsed by, or sponsored by StockX, and its rates change over time; verify every rate against your own current seller dashboard.

MIT licensed. See `LICENSE`.
