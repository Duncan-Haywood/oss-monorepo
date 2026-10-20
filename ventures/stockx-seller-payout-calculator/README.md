# StockX Seller Payout Calculator

StockX sneaker, streetwear, and card resellers can use this free browser-local calculator to find real net payout and net profit for one sale — after the seller fee (which drops by Seller Level), the Fast Shipping discount, the payment processing fee, and outbound shipping cost — then roll a list of sales up into monthly profit and check it against a profit goal. **After using this, you can tell whether a sale actually paid, which used to take a spreadsheet and a guess about whether your seller-fee rate was still the one you typed in last time your level changed.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/stockx-seller-payout-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the sale price is the wrong number to judge a flip by

A pair that "sold for $150" can land a lot less in your account once the real deductions come out — deductions that are not the same for every seller:

- **Seller fee, scaled by Seller Level.** StockX's transaction fee percentage drops as your completed-sale count and account history improve, so two sellers moving the identical item at the identical price can keep different amounts.
- **Fast Shipping discount** knocks a further percentage off the seller-level rate for sellers shipping from pre-verified local inventory — it stacks with the level rate rather than replacing it.
- **Payment processing fee** is a flat percentage of the sale price, charged the same regardless of seller level.
- **Shipping to the verification center** is closer to a flat dollar cost than a percentage, so it eats a much bigger share of a cheap item's payout than an expensive one's.
- **Other per-sale costs** — the box, tape, a replacement lace bag, label stock, the drive to the drop-off — behave exactly the same way, and this calculator had no field for any of them until 2026-09-22. Every sibling in this portfolio has carried such a bucket since it shipped. It defaults to `0`, so nothing about a saved draft, an existing shared link, or the worked example on the guide page moves.

## What price do I list at?

The page also runs the arithmetic backwards (`priceForProfit` in `calc.mjs`): the break-even sale price, and the price
that leaves the profit you type, given the same level, Fast Shipping, processing, shipping and supplies. Percentage
fees scale with the price and shipping does not, so the answer is `(cost + flat costs + wanted profit) / (1 - fee
share)`, and the tests sell at the returned price and check the profit comes out as asked.

## What is a Seller Level change worth?

The "What a Seller Level change is worth" table (`levelLadder` in `calc.mjs`) re-prices the sale you entered at each
seller-fee rate you list (read off your own dashboard; none is assumed) and shows the profit difference per sale and
per month at the sales volume you type. It answers "is reaching the next level worth chasing" without retyping the
sale for each rate. Fast Shipping, processing, shipping and supplies stay as entered.

## Comparing this pair against another channel

A seller who arrives here from a search for "how much does StockX take from sellers" usually has a second question: would the same pair net more on eBay, or in a local sale? Until now the only route to that answer was retyping the item into another tool, and most people do not — so the link under the buttons carries the price, cost basis, shipping and other costs straight into [`../where-to-sell-calculator/`](../where-to-sell-calculator/) with StockX already switched on, and that page hands numbers back the other way. Nothing is uploaded: the values ride in the URL fragment, which browsers never send to a server.

`to-where-to-sell.test.mjs` decodes every link through that page's *own* decoder and asserts the net profit it computes for the StockX row is the same number this page prints. That assertion is the reason the other-cost field above exists: before it did, packaging and supplies had nowhere to land here, and the two ends of the link disagreed on profit for the same item with nothing going red.

The month section then answers the question one sale's profit can't: given your actual sales this month, does it hit your profit goal, and if not, how many more sales at the same average profit close the gap?

This tool deliberately does not verify authenticity, track inventory, or read StockX's live fee schedule — those are StockX's own systems and your own seller dashboard. It only prices the payout and profit arithmetic of a sale you already made or are considering, from numbers you supply.

## What you use today, and what this does differently

- **StockX's own seller screen:** shows the payout for a live listing, but only after you have set it up, and it cannot show what a level change or Fast Shipping enrollment would do to a sale you are still pricing.
- **A spreadsheet:** flexible, but the fee rate, discount and processing percentage are typed by hand and go stale when your seller level moves.
- **Generic resale or marketplace fee calculators:** cover eBay and similar fees, rarely StockX's level-based fee with the Fast Shipping discount and your own cost basis.
- **What this adds:** net payout and net profit per sale with level, discount, processing, shipping and other costs, a monthly profit-goal check, and a one-click handoff to the cross-channel calculator. No account, no upload.

## Privacy and usage

Everything runs in your browser. Your sale figures and month list are never uploaded and there is no account. The sale inputs and the target monthly profit are saved on this device only, so you do not retype them — "Reset to defaults" clears them. The month table is a different promise: it is never saved anywhere and clears on refresh by design. We count anonymous local feature events only (`sale-priced`, `month-check`, `link-copied`, `reset`, `handoff_where_to_sell`, `sponsor_link_clicked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No sale prices, items, or profit figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. It is also not an authentication, inventory, or sourcing tool of any kind — it never verifies an item, tracks stock, or replaces your own StockX seller dashboard and payout statements. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, confirm a payout amount, or replace your own accountant. StockX is a trademark of StockX LLC, named here only to describe what this tool calculates — this tool is not affiliated with, endorsed by, or sponsored by StockX, and its rates change over time; verify every rate against your own current seller dashboard.

MIT licensed. See `LICENSE`.

## Host your own copy

Your data stays in your browser either way, but you can serve the page from an address you control. It is a static
site: the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
