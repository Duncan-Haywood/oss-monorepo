# Shopify Fee & Profit Calculator

A free Shopify fee calculator for merchants. It shows what an order leaves
after **Shopify Payments** or a **third-party processor** (PayPal, Stripe, and
the rest), including the extra Shopify third-party transaction fee that generic
fee pages skip. From the same inputs it reports net profit, margin, return on
the cash you put into the order (plus a share of the monthly plan), the
break-even listing price, and the price that hits a target margin.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Shopify will charge: enter the rates from your current
statements, and verify them there.

**After using this, you can now see whether PayPal or Stripe costs more than
Shopify Payments on a real order, and what to charge to keep a target
margin** — which used to mean a spreadsheet that forgot the extra Shopify fee.

## Why it's different

Most “Shopify fee calculator” pages apply one processing rate. The decision
merchants actually make is the payment path:

- **Shopify Payments** — processing percentage + fixed fee, no extra Shopify
  transaction fee on that path.
- **PayPal / Stripe / other** — the processor’s percentage + fixed fee *plus*
  Shopify’s third-party transaction fee (often 2% / 1% / 0.5% / 0% by plan).

This tool keeps every assumption editable, fills illustrative US online
defaults from a plan picker, allocates the monthly Shopify plan across
expected monthly orders, and shows **both paths on the same order**.

[Why PayPal can cost more on Shopify](why-paypal-costs-more.html) answers that
search question directly.
[Shopify POS vs online fees](shopify-pos-vs-online-fees.html) answers the
counter-vs-checkout question: whether a cheaper in-person tap still beats
the same SKU sold online after postage markup, and how many taps recover a
card reader.
[Should I buy Shopify Shipping labels?](should-i-buy-shopify-shipping-labels.html)
answers the postage question: whether a Pirate Ship, Shippo, or carrier-account
quote still beats the Shopify Shipping label after card fees, and what you
keep if checkout charges Shopify’s rate while you buy the cheaper label.
[Should I offer Shop Pay Installments?](should-i-offer-shop-pay-installments.html)
answers the installment question: whether the extra Shop Pay Installments
rate still pays after you blend the share of checkouts that use it, and how
many extra orders cover the gap.
[Should I offer store credit instead of a refund?](should-i-offer-store-credit-instead-of-a-refund.html)
answers the return question: whether issuing credit or exchanging still beats
sending cash after the return label, restock, and expected redemption.
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
browser; it never records the inputs. Turn it off with the checkbox in the
footer, or your browser's Do Not Track / Global Privacy Control setting.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # calc, usage, POS / label / installment / return / Capital / bank-transfer / chargeback / local-delivery / gift-card / Markets-duties page tests
```

`calc.mjs` holds the fee/profit/ROI arithmetic and plan presets; `usage.mjs`
holds the anonymous local counter; `index.html` is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
