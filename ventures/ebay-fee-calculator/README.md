# eBay Fee & Profit Calculator

A free eBay fee and profit calculator for resellers. It shows what an order
leaves after the final value fee, the per-order fixed fee, promoted-listings
and international fees, shipping, packaging, and — the part generic fee
calculators leave out — **what you paid to source the item**. From that it
reports net profit, margin, return on your invested cash (ROI), and the lowest
resale price that still breaks even. Set a target net margin to get the listing
price required to reach it, which makes the calculator useful for repricing as
well as sourcing.
Enter multiple units to see total batch economics and profit per unit without
repeating the calculation. Break-even and target-margin prices remain listing
prices for one unit.
Below the result, an **If you repriced** table prices the same order 20% and
10% either side of what you entered, so you can see what a price move is
actually worth before making it — no re-entering numbers.
A second table, **If you promoted**, holds the price still and only changes the
promoted-listings rate. It reports the highest ad rate that still breaks even
and the highest rate that still hits your target margin. Those caps do not
assume extra sales from the ads; they answer the cash question first, so you
can decide whether a campaign has to earn its keep with lift.

Open `index.html` in a browser. The calculation is local and works without an
account, network request, or API key. It is arithmetic, not an estimate of the
fees eBay will charge: enter the rates and costs that apply to your category
and store level, and verify them against your current eBay statements.

## Why it's different

Most "eBay fee calculator" pages stop at the fee and, at best, a single profit
number. A reseller's real decision is at sourcing time: *given what this will
sell for and what it costs me to buy and ship, is the return worth the cash?*
So this tool keeps every fee assumption visible and adds the two figures that
drive that decision:

- **ROI** — profit as a percentage of the cash you actually invested (item
  cost + shipping + packaging + other), because fees come out of the sale, not
  your pocket up front.
- **Break-even item price** — the lowest price you can list at without losing
  money, holding shipping charged constant.
- **Target-margin item price** — the price needed to reach a chosen net margin
  after the same fees and cash costs.
- **Repricing sensitivity** — profit, margin, and the signed change against
  your current price at listing prices 10% and 20% either side of it.
  Percentage fees scale with the price, so a $1 increase never leaves $1 more
  in the seller's pocket; the table makes that visible instead of leaving it to
  be re-derived by hand.
- **Promoted-listings sensitivity** — the same order at 0–12% ad rates, plus
  the rate you typed, with the cash cost of ads shown against the unpromoted
  row. The highest rate that still breaks even is the unpromoted net margin;
  the highest rate that still hits your target is that margin minus the target.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and sourcing data are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendors. The optional local counter records only the event name and day in your
browser; it never records the inputs. Turn it off with the checkbox in the
footer, or your browser's Do Not Track / Global Privacy Control setting.

The counted events are `order_profit_calculated`, `target_margin_calculated`,
`batch_calculated`, `price_sensitivity_viewed`, and
`promoted_sensitivity_viewed`. The last two are counted at most once per visit
and only after an input is edited — counting a table's first paint would just
re-count page loads and say nothing about whether the comparison is used.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
support is entirely voluntary and never changes what the tool does.

## Save and share

The calculator saves its ten numeric assumptions in your browser so returning
sellers do not re-enter them. **Copy shareable link** puts those assumptions in
the URL fragment for a collaborator; anyone with the link can read the figures,
so do not share sensitive information. Nothing is uploaded. Use **Reset saved
inputs** to remove the local setup.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # runs calc.test.mjs and usage.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic; `usage.mjs` holds the
anonymous local counter; `index.html` is the entire UI. All three are small
enough to read end to end.

## Opportunity

"eBay fee calculator" is a high-intent, high-volume query, and the reseller
segment behind it makes repeat pricing decisions with real money at stake.
Existing pages are ad-heavy and stop at the fee. A fast, private, no-signup
tool that closes the loop to ROI and break-even resale price is a small but
genuinely differentiated wedge, discoverable through organic search and AI
answers, with ~$0 marginal cost. A later, optional bring-your-own-key
assistant could read a seller's exported eBay fee report and pre-fill the
rates, but the useful core deliberately needs no AI or paid service.
