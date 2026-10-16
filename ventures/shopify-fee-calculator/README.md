# Shopify Fee & Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-fee-calculator/>

A free Shopify fee calculator for merchants. It shows what an order leaves
after **Shopify Payments** or a **third-party processor** (PayPal, Stripe, and
the rest), including the extra Shopify third-party transaction fee that generic
fee pages skip. From the same inputs it reports net profit, margin, return on
the cash you put into the order (plus a share of the monthly plan), the
break-even listing price, the price that hits a target margin or a target
dollar profit, and whether
Basic, Grow, Advanced, or Plus leaves more at your monthly volume.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Shopify will charge: enter the rates from your current
statements, and verify them there.

**After using this, you can now see whether PayPal or Stripe costs more than
Shopify Payments on a real order, what to charge to keep a target margin, and
how many orders it takes for Grow or Advanced to cover its extra monthly
fee** — which used to mean a spreadsheet that forgot the extra Shopify fee
and treated the plan upgrade as a guess.

## Why it's different

Most “Shopify fee calculator” pages apply one processing rate. The decision
merchants actually make is the payment path:

- **Shopify Payments** — processing percentage + fixed fee, no extra Shopify
  transaction fee on that path.
- **PayPal / Stripe / other** — the processor’s percentage + fixed fee *plus*
  Shopify’s third-party transaction fee (often 2% / 1% / 0.5% / 0% by plan).

This tool keeps every assumption editable, fills illustrative US online
defaults from a plan picker, allocates the monthly Shopify plan across
expected monthly orders, shows **both paths on the same order**, and ranks
**every plan at that volume** so the upgrade question is extra monthly cost
divided by per-order fee savings.

The target-profit result is a pricing aid, not a recommendation: it solves the
entered fee model for the item price that leaves the dollar profit you specify.
Shipping charged, variable costs, fixed fees, and allocated plan cost all stay
visible in the arithmetic.

[Why PayPal can cost more on Shopify](why-paypal-costs-more.html) answers that
search question directly.
[When does Shopify Grow beat Basic?](basic-vs-grow.html) answers the
plan-upgrade question: extra monthly plan cost divided by per-order fee
savings, and how many orders cover Grow or Advanced.
[Shopify POS vs online fees](shopify-pos-vs-online-fees.html) answers the
counter-vs-checkout question: whether a cheaper in-person tap still beats
the same SKU sold online after postage markup, and how many taps recover a
card reader. The main calculator runs the same
`compareOnlineVsPos` math on the order you just typed, so you do not
leave the page to check the tap versus checkout leftover.
[Should I buy Shopify Shipping labels?](should-i-buy-shopify-shipping-labels.html)
answers the postage question: whether a Pirate Ship, Shippo, or carrier-account
quote still beats the Shopify Shipping label after card fees, and what you
keep if checkout charges Shopify’s rate while you buy the cheaper label.
The main calculator runs the same `compareShippingLabels` math on the
order you just typed, so you do not leave the page to check the label
spread after card fees.
[Should I offer Shop Pay Installments?](should-i-offer-shop-pay-installments.html)
answers the installment question: whether the extra Shop Pay Installments
rate still pays after you blend the share of checkouts that use it, and how
many extra orders cover the gap. The main calculator runs the same
`compareShopPayInstallments` math on the order you just typed, so you do
not leave the page to check the extra fee and the lift that covers it.
[Should I offer store credit instead of a refund?](should-i-offer-store-credit-instead-of-a-refund.html)
answers the return question: whether issuing credit or exchanging still beats
sending cash after the return label, restock, and expected redemption.
[Which Shopify promo still pays](which-shopify-promo-costs-less.html) answers
the sale question: whether 10% off, a dollar-off coupon, or free shipping
keeps more after percentage fees, because free shipping still pays the label.
[What a refund rate still leaves](refunds.html) mixes completed-order profit
with a full-refund outcome so a merchant can see whether PayPal keeping its
fee on returns flips the comparison. Refund fields stay on that sibling page
so share/handoff work on `index.html` does not have to allowlist them.
[Should I take Shopify Capital?](should-i-take-shopify-capital.html)
answers the merchant-funding question: whether the Capital fee still beats
waiting to self-fund leftover profit or a bank line at a typed APR, and
how much extra monthly profit covers the fee.
[Should I take bank transfer on Shopify?](should-i-take-bank-transfer-on-shopify.html)
answers the invoice question: whether skipping the card fee still pays after
your collection rate, and whether holding the order beats shipping first.
[Should I fight a Shopify chargeback?](should-i-fight-a-shopify-chargeback.html)
answers the dispute question: whether refunding before the pull still beats
fighting or accepting after the chargeback fee, and the win rate that
flips representment.
[Should I offer local delivery on Shopify?](should-i-offer-local-delivery-on-shopify.html)
answers the drop-off question: whether driver time and miles still beat a
carrier label, and what you keep if you charge shipping and still deliver.
[Should I sell gift cards on Shopify?](should-i-sell-gift-cards-on-shopify.html)
answers the stored-value question: whether a card they redeem later still
beats selling the SKU now after sale-day fees, a leftover swipe, and a
promo off the face.
[Should I collect duties on Shopify?](should-i-collect-duties-on-shopify.html)
answers the Markets question: whether collecting duties at checkout (DDP)
still beats letting the buyer pay at the door (DAP) after the card fee
on the duty and the refuse leftover.
[Should I recover abandoned checkouts on Shopify?](should-i-recover-abandoned-checkouts-on-shopify.html)
answers the recovery question: whether leaving the checkout still beats
recovery emails or emails plus an item coupon after the send cost and
the cheaper ticket.
[Should I offer subscriptions on Shopify?](should-i-offer-subscriptions-on-shopify.html)
answers the subscribe-and-save question: whether a monthly leftover
after the discount, billing fee, and skip rate still beats a one-time
checkout, and when a prepaid pack keeps more.
[Should I offer pickup on Shopify?](should-i-offer-pickup-on-shopify.html)
answers the hold question: whether free or paid in-store pickup still
beats a carrier label after staff time, a lighter bag, and a no-show
refund mix.
[Should I add a Shopify upsell?](should-i-add-a-shopify-upsell.html)
answers the add-on question: whether a checkout offer still beats a
post-purchase one-click after the second swipe and the carts that
bounce because you asked before they paid.

**After using the plan-upgrade page, you can now see how many orders it
takes for Grow or Advanced to cover its extra monthly fee** — which used
to mean guessing from the plan picker rates.

**After using the POS page, you can now see whether a market table or
retail tap keeps more than checkout on that SKU** — which used to mean
comparing two rate cards and forgetting the postage line.

**After using the label page, you can now see whether Shopify Shipping or
your own label keeps more on the same order, including the leftover if you
charge Shopify’s quote and buy cheaper postage** — which used to mean
subtracting two label PDFs and forgetting that card fees sit on shipping charged.

**After using the installment page, you can now see whether Shop Pay
Installments still pay after the extra fee, including the conversion lift
that covers a blended month** — which used to mean staring at a 5.99%
sticker and turning the offer off.

**After using the return page, you can now see whether store credit or an
exchange still beats a cash refund on that order** — which used to mean
refunding the Shopify button default and forgetting redemption and the
second label.

**After using the Capital page, you can now see whether a 14% cash-advance
fee is a 45% simple annualized cost, and whether waiting still keeps more
when you are not buying inventory you would otherwise skip** — which used
to mean accepting the offer email because $1,400 looked cheap on $10,000.

**After using the bank-transfer page, you can now see whether skipping
2.9% + $0.30 still pays after a 5% unpaid-invoice rate, and whether you
have to hold the order for that save to survive** — which used to mean
turning on Mark as paid because the processor fee looked like free money.

**After using the chargeback page, you can now see whether a 25%
representment win rate still loses to refunding after a $15 fee, and
the win rate that would flip the table** — which used to mean fighting
every dispute because winning sounded free.

**After using the local-delivery page, you can now see whether a
25-minute drop-off still beats a $5 label after driver time and miles**
— which used to mean turning on Local Delivery because the postage
looked like the only cost.

**After using the gift-card page, you can now see whether a $50 card
still pays after the sale-day fee and a later redeem, including the
second swipe on a leftover ticket** — which used to mean selling
discounted cards because $50 in the bank looked like profit.

**After using the duties page, you can now see whether collecting
duties at Shopify checkout still beats a cheaper DAP door bill after
the extra card fee and refused packages** — which used to mean
turning on Markets duties because a $54 checkout looked kinder than
$62.10.

**After using the abandoned-checkout page, you can now see whether
recovery emails or a 10% coupon still beat leaving the checkout after
the send cost** — which used to mean turning on Shopify Email because
a $54 ticket that already walked away looked like free leftover.

**After using the subscription page, you can now see whether a 10%
subscribe-and-save still beats a one-time checkout after the billing
fee and skip rate** — which used to mean turning on Recharge because
a subscriber who stays looked free.

**After using the pickup page, you can now see whether an 8-minute
in-store hold still beats a $5 label after staff time and a 12%
no-show refund** — which used to mean turning on Local Pickup because
the postage looked like the only cost.

**After using the upsell page, you can now see whether an 18%
checkout add-on still beats a 12% one-click after a 2% extra
abandon** — which used to mean installing Rebuy because a $18
add-on looked like free leftover.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and shop data are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendors. The optional local counter records only the event name and day in your
browser; it never records the inputs — including `handoff_opened`, which says
an item arrived from the channel comparison and nothing about what it was. Turn
it off with the checkbox in the footer, or your browser's Do Not Track / Global
Privacy Control setting.

The page can copy a private share link containing the current numeric inputs and
payment path, or copy a text order summary for a partner or spreadsheet. The
link is encoded in the URL and is never sent to this project; do not put
sensitive information in calculator fields because URLs may be retained by
browser history or messaging tools. Sharing and summary-copy events are counted
locally without recording the calculation values.

## Arriving from the channel comparison

[`where-to-sell-calculator`](../where-to-sell-calculator/) puts one item through
eBay, Etsy, Amazon, an own store and a direct sale, and then offers **"keep
going with this item"** into whichever channel's own calculator goes deeper.
Following the own-store link fills in the price, what you paid, both postage
figures, packaging and your monthly order count — and leaves everything else at
this page's starting figures. **Check the plan and the payment rates against
your own Shopify billing before trusting the result.**

Monthly order count travels because the Shopify plan is a monthly fee, and
amortising it over real order volume is the reason an own store can win on fees
and lose on cash. Arriving without it would price the plan against this page's
example order count rather than yours.

Two link shapes therefore reach this page, and they behave differently on
purpose. A **share link** is one token carrying the whole scenario: it decodes
completely or it is refused, so whoever opens it sees exactly what the sender
saw. A **handoff link** carries only what the other calculator knew, fills that
in, and leaves the rest alone — refusing it would leave the comparison's
own-store row with no way through, which is where it was before. A link that is
truncated or mangled falls back to this page's example numbers and says so.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # calc, usage, plan-upgrade, POS / label / installment / return / refund-rate / Capital / bank-transfer / chargeback / local-delivery / gift-card / Markets-duties / abandoned-checkout / subscription / pickup / upsell page tests
```

`calc.mjs` holds the fee/profit/ROI arithmetic, plan presets, `comparePlans`,
and the refund mix; `usage.mjs` holds the anonymous local counter;
`index.html` is the completed-order calculator; `basic-vs-grow.html` is the
plan-upgrade break-even; `refunds.html` is the refund-rate mix.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
