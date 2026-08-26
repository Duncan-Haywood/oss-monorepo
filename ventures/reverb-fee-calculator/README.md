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
Reverb offer that matches eBay list cash, and whether charging shipping,
folding postage into the list, or offering local pickup leaves more, which
used to mean opening two seller fee pages and a spreadsheet.

## Offer versus list

The decision Reverb sellers actually make is not "what is my profit on this
listing." It is "this $720 offer just arrived on an $800 guitar — do I take
it?" The calculator keeps both prices on one screen and names the cash you
leave versus waiting.

It also names the Reverb offer that leaves the same cash as selling the item
on eBay at your list price, so a lowball can be compared to the other channel
you would actually use.

The SEO page
[`should-i-take-this-reverb-offer.html`](should-i-take-this-reverb-offer.html)
walks the default worked example ($800 list, $720 offer, $284.33 vs $210.65
on Reverb, $233.76 on eBay at list, $745.10 crossover).

## Buyer-pays shipping, free shipping, or pickup

Reverb marketplace and Reverb Gives apply to the item price. Payment
processing applies to item plus shipping charged. That makes "free shipping"
a different sale than charging postage for the same checkout: folding $75
into an $875 list raises the marketplace line, even though the buyer still
pays $875.

The calculator keeps three paths on one screen:

- **Buyer pays shipping** — your list plus shipping charged, postage you pay.
- **Shipping included** — same checkout, postage baked into the item, so
  marketplace (and Gives) rise.
- **Local pickup** — your list, no shipping charged, no postage you pay.

It also names the included list that leaves the same cash as charging
shipping, so you can see how much the buyer would have to pay all-in to
offset the extra marketplace line.

The SEO page
[`should-i-include-shipping-on-reverb.html`](should-i-include-shipping-on-reverb.html)
walks the default worked example ($800 + $75 charged / $65 you pay: $284.33
buyer-pays, $280.58 included, $276.50 pickup, $879.07 included list that
matches buyer-pays). Comparison is derived from the existing sale fields —
no second form.

This is distinct from the eBay fee calculator (final-value fee on one
channel), the Etsy profit calculator (listing credits and Plus), Amazon FBA
(fulfillment and storage), and the where-to-sell ranker (a custom "other
channel" row, not Reverb's offer-versus-list or shipping-packaging shape).

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
