# Reverb Fee Calculator

The free Reverb fee calculator shows what a sale leaves after marketplace
fees, payment processing, optional Reverb Gives, a bump, shipping, and what
you paid for the gear. Use it when a buyer offer lands and you need to know
whether taking it still beats waiting for list — or listing the same item on
eBay.

Open `index.html` in a browser. The calculation is local and works without an
account, network request, or API key. It is arithmetic, not an estimate of the
fees Reverb or eBay will charge: enter the rates from your last payout and
verify them against your current statements.

After using this, you can now see cash at list, cash on the offer, the
Reverb offer that matches eBay list cash, whether taking the offer now
beats the probability-weighted value of waiting for a better one, whether
charging shipping, folding postage into the list, absorbing the label, or
offering local pickup leaves more, whether Reverb Safe Shipping still beats
your own label after expected claims, whether a bump still pays if it gets
you from the offer to list, and whether consigning at a shop or taking
their cash offer still beats listing it yourself, which used to mean
opening two seller fee pages and a spreadsheet.

## Pay for a bump, or take the offer

A bump is a fixed cash out of this sale. Paying $3 and still taking the
$720 offer always leaves $3 less. It only pays if it changes the price
you take — list instead of the offer, or an offer high enough to cover
the bump after marketplace and payment take their cut.

The SEO page
[`should-i-bump-this-reverb-listing.html`](should-i-bump-this-reverb-listing.html)
walks the default worked example ($3 illustrated bump, $210.65 offer vs
$281.33 list-with-bump, $70.68 save, $723.26 cover).

## Offer versus list

The decision Reverb sellers actually make is not "what is my profit on this
listing." It is "this $720 offer just arrived on an $800 guitar — do I take
it?" The calculator keeps both prices on one screen and names the cash you
leave versus waiting.

It also names the Reverb offer that leaves the same cash as selling the item
on eBay at your list price, so a lowball can be compared to the other channel
you would actually use.

Seeing that crossover number is not the same as acting on it — a seller who
agrees the offer is short still has to write the reply. "Copy counter-offer
message" turns the same arithmetic into a message ready to paste into the
Reverb inbox: it names the buyer's offer and, if it falls short of the
eBay-list crossover, asks for a price rounded up to the nearest whole dollar
(a counter with cents reads as a spreadsheet, not a person); if the offer
already clears the crossover, it drafts an acceptance instead of a counter.
Nothing is sent for you — it is copied to the clipboard, or shown inline if
the browser refuses clipboard access, for the seller to review and send.

The SEO page
[`should-i-take-this-reverb-offer.html`](should-i-take-this-reverb-offer.html)
walks the default worked example ($800 list, $720 offer, $284.33 vs $210.65
on Reverb, $233.76 on eBay at list, $745.10 crossover).

## Take the offer now, or wait for a better one?

Every comparison above treats "wait for list" as a sure thing. It is not.
Declining an offer does not buy a sale at list — it buys a *chance* of one,
and the realistic alternative if that chance doesn't land is usually another
offer near (or below) the one already in hand. That is the actual decision a
lowball forces: certain cash now against a probability-weighted average
later.

The calculator adds two inputs — your typed odds of eventually reaching
list, and the price you would realistically settle for otherwise — and
prices three paths on one screen:

- **Take the offer now** — certain cash, the baseline.
- **Wait, eventually reach list** — weighted by your typed probability.
- **Wait, eventually settle for less** — weighted by the remaining
  probability, at your typed fallback price.

It also names the **break-even chance of reaching list**: below it, taking
the offer wins on average; above it, waiting does. The fallback price
defaults *below* the offer rather than at list, on purpose — an inbox that
produced one lowball tends to produce more of them, and defaulting the
fallback at list would quietly assume away the downside of holding out.

The SEO page
[`should-i-wait-for-a-better-reverb-offer.html`](should-i-wait-for-a-better-reverb-offer.html)
walks the default worked example ($720 offer / $800 list / $680 fallback /
30% typed chance: $208.15 certain now vs. $204.48 in expectation waiting,
33.33% break-even chance).

## Buyer-pays shipping, free shipping, or pickup

Reverb marketplace and Reverb Gives apply to the item price. Payment
processing applies to item plus shipping charged. That makes "free shipping"
a different sale than charging postage for the same checkout: folding $75
into an $875 list raises the marketplace line, even though the buyer still
pays $875.

The calculator keeps four paths on one screen:

- **Buyer pays shipping** — your list plus shipping charged, postage you pay.
- **Shipping included** — same checkout, postage baked into the item, so
  marketplace (and Gives) rise.
- **Local pickup** — your list, no shipping charged; add gas or parking as
  the meetup cost if pickup is not free.
- **You absorb the label** — keep the typed list, offer free shipping, and
  still buy the label. The buyer pays less; you keep less. That is not the
  same sale as folding postage into the item.

It also names the included list that leaves the same cash as charging
shipping, so you can see how much the buyer would have to pay all-in to
offset the extra marketplace line.

The SEO page
[`should-i-include-shipping-on-reverb.html`](should-i-include-shipping-on-reverb.html)
walks the default include-vs-charge example ($800 + $75 charged / $65 you
pay: $284.33 buyer-pays, $280.58 included, $276.50 pickup, $879.07 included
list that matches buyer-pays).
[`should-i-eat-the-shipping-on-reverb.html`](should-i-eat-the-shipping-on-reverb.html)
walks absorbing the label on the same guitar ($211.50 — $69.08 less than
including shipping, $72.83 less than charging the buyer).

## Your own label or Reverb Safe Shipping

Safe Shipping is a more expensive label, not a different checkout. The
buyer still pays the same shipping charged. You pay more postage; they
cover a damaged or lost shipment. Your own label is cheaper and you eat
the claim.

The calculator keeps three paths on one screen:

- **Own label if nothing goes wrong** — typed shipping you pay, no claim.
- **Own label after expected claims** — same sale minus (claim rate × cash
  you lose on an unprotected claim).
- **Reverb Safe Shipping** — typed Safe Shipping quote as the label you
  pay. A $0 quote is illustrated at your own label plus $15 so the table
  is never empty.

It also names the break-even unprotected claim rate: extra label cost
divided by the claim. Below that rate your own label still leaves more
expected cash.

The SEO page
[`should-i-buy-reverb-safe-shipping.html`](should-i-buy-reverb-safe-shipping.html)
walks the default worked example ($65 own label, $80 Safe Shipping, $450
claim, 2% rate: $284.33 if nothing goes wrong, $275.33 after the $9.00
expected claim, $269.33 on Safe Shipping, 3.33% break-even). Complementary
to who pays postage (buyer / included / pickup) and to open PRs that absorb
the label into the list or compare a bump — those do not compare insured
label versus own postage.

## List it yourself, consign, or take their cash

A shop that will consign the guitar or buy it today is a different sale
than a Reverb checkout. Consignment is a percent of *their* sale — they
ship and they collect, so you do not pay marketplace, payment processing,
a bump, or a label. Their cash offer is a buy today: that number minus
what you paid for the gear.

The calculator keeps three paths on one screen:

- **List it yourself on Reverb** — your list, Reverb fees, postage, packing.
- **Consign at the shop** — shop sale price times (1 − their cut).
- **Take their cash offer today** — the number they would hand you now.

It also names the shop cut, the shop sale price, and the cash offer that
leave the same cash as Reverb at list, so a 30% "we'll handle it" quote
can be checked against the listing you already have.

The SEO page
[`should-i-consign-this-reverb-listing.html`](should-i-consign-this-reverb-listing.html)
walks the default worked example ($800 Reverb list / $800 shop sale / 30%
cut / $520 cash: $284.33 self-list, $110.00 consign, $70.00 cash, 8.21%
break-even cut, $1049.04 shop sale that matches list, $734.33 cash that
matches list). Complementary to offer-versus-eBay, who pays postage, Safe
Shipping, and to open PRs that compare a bump or absorb the label into
the list — those do not compare a shop cut or a shop cash offer.

This is distinct from the eBay fee calculator (final-value fee on one
channel), the Etsy profit calculator (listing credits and Plus), Amazon FBA
(fulfillment and storage), and the where-to-sell ranker (a custom "other
channel" row, not Reverb's offer-versus-list or shipping-packaging shape).

## Comparing to other channels without retyping

The footer's link to the
[where-to-sell calculator](../where-to-sell-calculator/) carries this item's
price, shipping and cost across and switches Reverb on there, so ranking it
against eBay, Etsy, Amazon and an own store does not mean re-entering
anything (`to-where-to-sell.mjs`). This is the reverse of that tool's own
handoff, which already carried a comparison down into this page — until now
the link only ran one way, so a seller who landed here first (from a search
like "should I take this Reverb offer") had to retype the item to see it
ranked against other channels.

Only the numbers every channel shares travel — price, shipping charged,
shipping paid, item cost, and the general-cost bucket. Reverb's own fee rates
have no equivalent field on the where-to-sell side, so they are left out
rather than guessed at; the receiving page prices Reverb from its own
illustrative preset. `to-where-to-sell.test.mjs` decodes every link through
that page's own decoder, so a change to its payload shape fails a test here
instead of arriving as a wrong number there.

## Take the return, or refund part of it

A buyer opens a case. The instinct is to treat this as "return or no
return", and on a marketplace of identical commodity units that is roughly
the shape of it: the item goes back on the shelf and you are out the
freight. Used gear is not that, for three reasons the calculator prices
separately:

- **Freight runs three legs, not one.** Out, back, and out again on the
  relist. On a combo amp or a hardshell case each leg is real money — $205
  of the $249.48 the default return costs.
- **The piece is one of one.** There is no second unit on the shelf, so the
  cash you recover is whatever the *relist* fetches, and something that has
  shipped twice with a claim opened rarely fetches the first price. That
  haircut is an input (`relistPrice`), set to $0 for a piece that comes
  back unsellable.
- **The fee credit is partial.** Reverb credits the selling fee on a
  refund; the card processor generally keeps its cut. The residue is
  charged whether the buyer keeps the item or ships it back.
  `feeRefundOnReturnPct` defaults to 61 — the selling fee's share of total
  fees on the worked example, not a claim about anyone's current schedule.

So the number the calculator leads with is not a verdict on the return. It
is **the largest partial refund that still beats taking it back**: on the
defaults, $261.39, or 32.7% of an $800 sale. Four paths sit on one screen —
sale stands, partial refund, take the return, full refund and they keep it.

The SEO page
[`should-i-take-the-return-or-refund-on-reverb.html`](should-i-take-the-return-or-refund-on-reverb.html)
walks the default worked example ($800 sale / $75 return label / 61% fee
credit / $720 relist: $284.33 if the sale stands, $34.85 on the return,
$141.16 on a $150 concession, −$550.80 on a full refund with the item gone;
$261.39 break-even concession; $910.12 return cost if the piece comes back
unsellable).

**What this does not say.** An expensive return is not a refusable one.
Nothing here changes what Reverb's policies or your local consumer law
require of you, and the page says so — the arithmetic is for the case where
you have a choice about what to offer, not an argument for denying a case.
Complementary to Safe Shipping (which prices preventing some of these
claims, not resolving one) and to offer-versus-list.

## Save and share your numbers

Your payout rates and gear costs are the part you would otherwise re-enter
every visit, so the calculator keeps them:

- **Restored on return.** Your inputs are saved in your browser and reappear
  the next time you open the page. **Reset to defaults** clears them.
- **Shareable link.** **Copy shareable link** writes your current inputs into
  the page URL and copies it. A link's values always take precedence over
  whatever a browser had saved.

The link and the saved copy contain only the numbers you typed. They never
include anything else, and nothing is uploaded.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and payout data are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendor. Two things are stored locally, on your device only: the numbers you
enter (clear them with **Reset to defaults**) and, unless you opt out, an
anonymous counter that records only an event name and the day. The counter
never records your inputs. Turn it off with the checkbox in the footer, or
your browser's Do Not Track / Global Privacy Control setting.

## Opportunity

Independent Reverb sellers search for "Reverb seller fees" and "should I take
this Reverb offer" because a 5% marketplace fee plus payment processing plus
shipping makes a $80 lowball look smaller than it is. Existing fee pages
return one fee estimate; this tool keeps every customer-entered assumption
visible and compares the offer to list and to eBay.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
