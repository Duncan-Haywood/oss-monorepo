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
Enter an expected return rate to see **expected profit after returns**, the
cash one returned unit still eats (outbound label, packaging, return
postage, and any fees that are not refunded), and the return rate that takes
expected profit to zero. The completed-sale profit stays visible; the return
view mixes that profit with the return loss at the rate you typed. It assumes
the item comes back into inventory. [Why a 10% return rate can erase a thin
listing](do-ebay-returns-wipe-the-profit.html).
An **Auction vs Buy It Now** table then multiplies that expected sale by
sell-through, subtracts insertion fees, and shows the hammer that matches
Buy It Now expected profit. A completed auction sale is often cheaper;
auctions still win when they actually sell.
[Should I list this as an auction or Buy It Now?](should-i-list-ebay-auction-or-buy-it-now.html).
A **Partial refund vs taking the return** table then closes one buyer
case three ways: send a concession and let them keep it, take the return,
or refund the whole order without getting the item back.
[Should I offer a partial refund on eBay?](should-i-offer-a-partial-refund-on-ebay.html).
An **Authenticity Guarantee vs skip-AG** table then prices the same
listing two ways: skip the program at a lower sell-through, or pay the
typed authenticity fee plus extra hub shipping for a higher sell-through
and a lower authenticity-claim return rate.
[Is eBay Authenticity Guarantee worth it?](is-ebay-authenticity-guarantee-worth-it.html).
A **Local pickup vs the label** table then prices the same listing two
ways: ship it at a higher sell-through and pay the outbound label, or
offer pickup only, skip postage, pay meetup time, and take a no-show
rate.
[Should I offer local pickup on eBay?](should-i-offer-ebay-local-pickup.html).
A **Lot vs individual listings** table then prices the same pile two
ways: keep one lot listing, or split the pieces and pay a label,
insertion, and listing session on each.
[Should I break an eBay lot into individual listings?](should-i-break-an-ebay-lot-into-individual-listings.html).

**After using the authenticity page, you can now see whether a 3% fee
and an $8 hub label still beat skip-AG on that SKU** — which used to
mean enrolling because “buyers trust the badge” and never pricing the
label.

**After using the pickup page, you can now see whether skipping a $5
label still beats a 25-minute meetup after no-shows** — which used to
mean offering pickup because “the buyer is local” and never pricing
the drive.

**After using the lot page, you can now see whether five $14 listings
still beat a $40 lot after five labels and listing time** — which used
to mean breaking every pile because “singles always make more” and
never pricing the extra postage.

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
- **Expected profit after returns** — the completed-sale profit mixed with
  the cash a return still eats, at the return rate you enter. A thin listing
  can look fine on one sale and lose money once 8–12% of orders come back.
- **Auction vs Buy It Now** — expected listing profit after sell-through and
  insertion, plus the auction close that matches Buy It Now. Promoted
  Listings Standard stays on the fixed-price row unless you type an
  auction promoted rate.
- **Partial refund vs taking the return** — cash kept after a $15 (or
  typed) concession versus a real return versus a full refund they keep.
  Percentage fees usually come back on the refunded amount; the outbound
  label does not. The table also names the concession that still ties a
  return.
- **Authenticity Guarantee vs skip-AG** — expected listing profit after
  sell-through with and without the program. The authenticity fee comes
  back on a return; the extra hub label does not. The table also names
  the hub-shipping ceiling that still ties skip-AG.
- **Local pickup vs the label** — expected listing profit after
  sell-through with shipping versus pickup. Meetup time is paid on
  every scheduled handoff, including no-shows. The table also names
  the outbound-label ceiling that still ties pickup.
- **Lot vs individual listings** — expected listing profit after
  sell-through with one lot versus N singles. Listing time and
  insertion fees are paid on every listing, including the ones that
  do not sell. The table also names the single price that still ties
  the lot.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and sourcing data are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendors. The optional local counter records only the event name and day in your
browser; it never records the inputs. Turn it off with the checkbox in the
footer, or your browser's Do Not Track / Global Privacy Control setting.

The counted events are `order_profit_calculated`, `target_margin_calculated`,
`batch_calculated`, `return_rate_viewed`, `listing_format_compared`,
`partial_refund_compared`, `authenticity_compared`,
`local_pickup_compared`, `lot_vs_singles_compared`, and
`price_sensitivity_viewed`.
`price_sensitivity_viewed`, `listing_format_compared`,
`partial_refund_compared`, `authenticity_compared`,
`local_pickup_compared`, and `lot_vs_singles_compared` are counted at most
once per visit and only after an input is edited — counting the table's
first paint would just re-count page loads and say nothing about whether
the view is used.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
support is entirely voluntary and never changes what the tool does.

## Save and share

The calculator saves its numeric assumptions in your browser so returning
sellers do not re-enter them, including the expected return rate and return
postage. **Copy shareable link** puts those assumptions in the URL fragment
for a collaborator; anyone with the link can read the figures, so do not
share sensitive information. Nothing is uploaded. Use **Reset saved inputs**
to remove the local setup.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # calc, share, usage, and page tests
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
