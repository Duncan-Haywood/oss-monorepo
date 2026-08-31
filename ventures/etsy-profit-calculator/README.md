# Etsy Profit Calculator

The free Etsy profit calculator shows what an order leaves after listing fees,
transaction fees, payment processing, offsite ads, shipping, materials, and
other per-order costs — including return on the cash you put into materials and
shipping, and a side-by-side of organic vs 12% vs 15% Offsite Ads. Use it
before changing a price, publishing a listing, or taking an attributed ad sale.

Open `index.html` in a browser. The calculation is local and works without an
account, network request, or API key. It is arithmetic, not an estimate of the
fees Etsy will charge: enter the rates and costs that apply to your shop and
verify them against your current Etsy statements.

## Save and share your numbers

Your shop's fees and costs are the part you would otherwise re-enter every
visit, so the calculator keeps them:

- **Restored on return.** Your inputs are saved in your browser and reappear
  the next time you open the page, so you land on your own shop's numbers
  instead of the example order. **Reset to defaults** clears them.
- **Shareable link.** **Copy shareable link** writes your current inputs into
  the page URL and copies it. Bookmark it to reopen the calculator already
  filled in, or send it to a partner or bookkeeper — opening the link shows
  exactly the numbers you configured. A link's values always take precedence
  over whatever a browser had saved.
- **Copyable order summary.** **Copy order summary** writes a plain-text
  fee breakdown — revenue, each fee line, cash invested, leftover, margin,
  return on cash, and the target-margin price — so you can paste it into a
  note or a buyer conversation without screenshotting the page.

The link and the saved copy contain only the numbers you typed into the fee and
cost fields. They never include anything else, and nothing is uploaded.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and shop data are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor.
Two things are stored locally, on your device only: the numbers you enter (so
they can be restored on your next visit — clear them with **Reset to defaults**)
and, unless you opt out, an anonymous counter that records only an event name
and the day. The counter never records your inputs. A shareable link carries
your numbers only inside the URL you copy, and only when you click **Copy
shareable link**. Turn the counter off with the checkbox in the footer, or your
browser's Do Not Track / Global Privacy Control setting.

## Opportunity

Independent Etsy sellers search for "Etsy fee calculator" and "Etsy profit
calculator" because the marketplace's fee stack makes a listing's break-even
price hard to see. Existing fee calculators generally return one fee estimate;
this tool keeps every customer-entered assumption visible and shows the
contribution left after variable costs. A later, optional bring-your-own-key
assistant could explain a seller's own exported fee statement, but the useful
core deliberately needs no AI or paid service.

## Repricing workflow

Enter a target margin to calculate the item price needed to reach it, then
compare prices $10 below and above the current price. This turns a fee
calculation into a quick pricing decision without uploading product data or
relying on Etsy's changing fee schedule.

You can also enter a target dollar profit per order. This is useful when labor,
packing time, or a minimum return matters more than a percentage margin. Both
targets use the same visible fee and cost assumptions as the order result.

## Is Etsy Plus worth it this month?

The calculator also compares staying off Plus with using the listing credits
and Etsy Ads credit you would actually spend. Unused credits expire and are
not counted as savings. Extra listings past the credit cap cost the same on
both paths, so volume alone does not make Plus cheaper. Shop customization
and restock requests are left at $0 unless you assign them a dollar value.

At the published $10 / 15 listing credits / $5 Ads credit example and a
$0.20 listing fee, using every credit still leaves Plus $2 more expensive
than paying the listing fees and Ads yourself. Change the inputs to match
your Plus invoice. The SEO page
[is-etsy-plus-worth-it.html](is-etsy-plus-worth-it.html) walks through the
same worked examples.

## Does this personalization still pay?

Sellers add a name, color, or size and guess at an $8 add-on. Transaction
and payment fees sit on the higher ticket, and extra time plus materials
often eat the rest. The calculator compares selling the listing as written
with taking the custom request, shows the break-even upcharge, and
separates two frames: this buyer would have bought the standard item
anyway, versus this request is extra demand.

On the default $30 listing, an $8.00 personalization with $1.50 extra
materials and $6.00 extra time (twenty minutes at $18/hour) leaves $20.97
— $0.26 less than the $21.23 standard sale. The upcharge has to reach
about $8.29 before the upgrade wins. Drop the time cost to $0.00 and the
same $8.00 keeps $5.74 more. Charge $12.00 and the upgrade keeps $3.36
more ($40.32 across 12 custom orders). If the request is extra demand you
would not have sold otherwise, the personalized order still leaves $20.97
versus $0.00. The SEO page
[should-i-charge-for-etsy-personalization.html](should-i-charge-for-etsy-personalization.html)
walks through the same examples.

## Do on-site Etsy Ads still pay?

On-site Etsy Ads is a click you buy. Offsite Ads is a percentage Etsy
takes when it sends the buyer — a different fee, already on the order
form. ACOS is spend divided by attributed sales. The calculator compares
an organic sale with the same order after that Ads cash, shows the ACOS
ceiling where an extra advertised order still breaks even, and turns a
monthly Ads budget into extra orders kept if the clicks are incremental.

On the default $30 listing, a 12% ACOS costs $4.20 on the $35 order and
leaves $17.03 — $4.20 less than the $21.23 organic sale. An extra
advertised order still pays until ACOS reaches about 60.64%. A $5.00
monthly budget at that ACOS buys about 1.19 advertised orders and keeps
$20.27 if they are incremental. Raise ACOS to 70% and the advertised
order loses $3.27 even as extra demand. Turn on 15% Offsite Ads and the
same 12% ACOS ceiling falls to about 45.64%. The SEO page
[is-etsy-ads-worth-it.html](is-etsy-ads-worth-it.html) walks through the
same examples.

## Do Offsite Ads still leave a profit?

Offsite Ads are a percentage Etsy takes on the order total when it
attributes the sale to Google or social. That is not on-site Etsy Ads.
Shops under $10,000 in trailing 12-month sales typically pay 15%; shops
over that threshold typically pay 12%. The calculator shows organic,
12%, and 15% on the same listing, plus the highest rate that still
breaks even, and return on the cash you put into materials and shipping.

On a $14 print with $3 shipping charged, $5.50 postage, and $7
materials, organic leftover is $2.44 (19.5% ROI on $12.50 cash). 12%
takes $2.04 and leaves $0.39. 15% takes $2.55 and leaves −$0.12. The
order stays at or above $0.00 leftover until Offsite Ads reach about
14.3%. The default $30 listing still keeps $15.98 at 15% — the tight
print is the case that flips. The page
[are-etsy-offsite-ads-worth-it.html](are-etsy-offsite-ads-worth-it.html)
walks through the same examples. It does not opt a shop in or out.

## Does this production partner still pay?

A partner quote looks expensive per piece until you run out of hours.
Handmade leftover is materials plus your time. The partner path is their
all-in unit cost plus handling — they buy the materials. Fees stay the
same because the ticket does not change. If you can only make some of
the orders you can sell, overflow leftover is $0 unless someone else
makes it.

On the default $30 listing, $8.00 of your time, a $14.00 partner quote,
and $1.00 handling, handmade keeps $13.23 and the partner keeps $10.23
— $3.00 less per sale. You can only make 20 of the 40 you can sell, so
staying handmade leaves $264.60 this month. Sending every order to the
partner leaves $409.20. Making what you can and sending the overflow
keeps $469.20. The quote has to fall to about $11.00 before it matches
handmade leftover. A $10.00 quote keeps $14.23 per sale. A 10% reject
rate on the $14.00 quote raises the effective cost to $16.67. The SEO
page
[should-i-use-an-etsy-production-partner.html](should-i-use-an-etsy-production-partner.html)
walks through the same examples.

## Does Star Seller still beat staying unsigned?

The badge is free. The cash it costs is a faster label to stay on-time
and the minutes you spend answering messages in 24 hours. The cash it
returns is a higher sell-through on the same listings. Message time is
paid only on packed sales.

On the default $30 listing, $6.00 unsigned postage vs $9.00 Star Seller
postage, 8 minutes at $18/hour, and 40% vs 50% sell-through, a packed
unsigned sale keeps $21.23 and a packed Star Seller sale keeps $15.83.
Expected keep is $8.49 vs $7.91 — $0.58 less per listing, $23.20 less
across 40 listings. The badge has to convert about 53.6% before it
matches staying unsigned. Star Seller postage has to stay at or below
about $7.85 at this lift. A 20-point lift (40% → 60%) flips Star Seller
ahead by $1.01 per listing. A $7.00 Star Seller label keeps $0.42 more.
A shop already converting 70% that only lifts to 75% still loses $2.99
per listing. A 20% → 35% shop keeps $1.29 more with the badge. The SEO
page
[is-etsy-star-seller-worth-it.html](is-etsy-star-seller-worth-it.html)
walks through the same examples.

## Does this shop sale still beat staying full price?

A 20% shop sale looks like a conversion cheat until every buyer who
would have paid full price leaves $5.43 less. The cash a sale returns
is a higher sell-through on the same listings. Percentage fees sit on
the lower ticket; postage and materials do not change. This is not
free shipping and it is not on-site Ads.

On the default $30 listing, 20% off vs a $5.00 coupon, and 40% vs 55%
sell-through, a packed full-price sale keeps $21.23, 20% off keeps
$15.80 (−$5.43 if they would have paid full price), and $5.00 off
keeps $16.70 (−$4.53). Expected keep is $8.49 vs $8.69 vs $9.19.
The $5 coupon expects $0.70 more per listing and $28.00 more across
40 listings. 20% off has to convert about 53.8% before it matches
staying full price; $5 off has to convert about 50.8%. At this lift
the sale has to stay at or below about 21.3% or $6.40 off. A 10-point
lift (50% sale sell-through) loses on both coupons. 15% Offsite Ads
make 20% lose $0.10 while $5 still keeps $0.32 more. A shallower 10%
sale expects $10.18 and beats both full price and the $5 coupon. The
SEO page
[should-i-put-my-etsy-shop-on-sale.html](should-i-put-my-etsy-shop-on-sale.html)
walks through the same examples.

## Does free shipping still leave a profit?

A free-shipping badge looks like a ranking cheat until every packed
order at a $32 item price leaves $2.72 less than charging $5.00
shipping. Percentage fees sit on the customer total, so moving the
whole label into the item price is a tie. The cash free shipping
returns is extra orders, not a cheaper fee stack. This is not a shop
sale and it is not on-site Ads.

On the default $30 listing, charging shipping keeps $21.23. Free
shipping at the same $30 item price keeps $16.70 (−$4.53). Absorbing
the $5.00 label into a $35.00 item is a tie at $21.23. Free shipping
at $32.00 keeps $18.51 (−$2.72). At 40 orders/month it needs about
5.9 extra orders (14.7%) to match $849.00. Eating the label needs
about 10.8 extra orders. A $40.00 free-shipping price already keeps
$25.75 (+$4.52) and does not need extra volume. 15% Offsite Ads raise
the $32 lift to about 6.6 extra orders. The SEO page
[should-i-offer-free-shipping-on-etsy.html](should-i-offer-free-shipping-on-etsy.html)
walks through the same examples.

## Does an Etsy shipping label still beat Pirate Ship?

Buying the label is not free shipping and it is not Star Seller. An
Etsy quote auto-uploads tracking and usually keeps a lower
item-not-received rate because Purchase Protection rides with the
label. A Pirate Ship, Shippo, or carrier-account quote is often
cheaper. Tracking is uploaded by hand, so typed upload time sits on
every box, and the leftover claim rate is usually higher.

On the default $30 listing, a $6.00 Etsy label at 0.8% claims expects
$20.98. A $5.10 third-party label at 2.5% claims after four minutes
at $18/hour ($1.20) expects $20.14 — $0.84 less per shipment and
$33.60 less across 40. The same postage with no extra time expects
$21.34 (+$0.36). Four minutes wipe a $0.90 postage save. No
third-party claim rate on the timed path can match Etsy. The quote
has to stay at about $4.27 before it matches. Drop the minutes to
zero and Pirate Ship keeps $0.36 more (claim ceiling about 3.7%).
A $4.00 quote and one upload minute expects $22.14 (+$1.16). 15%
Offsite Ads still leave Etsy ahead ($15.77 vs $15.03). The SEO page
[should-i-buy-etsy-shipping-labels.html](should-i-buy-etsy-shipping-labels.html)
walks through the same examples.

## Does auto-renew still cover a slow listing?

Etsy charges the listing fee when a listing publishes or auto-renews,
not once per sale. The order calculator subtracts that fee from every
order, which overstates cost on a listing that sells more than once
and hides the fee on a listing that sells nothing.

Open [listing-renewal.html](listing-renewal.html) and type the sales
you actually expect in one renewal window. On the default $30 listing
with $1 other cost, contribution before the listing fee is $20.43.
Two sales in four months leave $40.65 after the $0.20 fee ($0.10 per
sale). One sale recovers the fee. Zero sales still cost $0.20 — $0.60
a year at a four-month window. Charging $0.20 on every order
overstates listing cost by $0.20 across those two sales, or $0.80
across five. The page does not turn auto-renew on or off.

## What price keeps a leftover I name?

The order calculator already solves leftover at the price you typed,
including a Target profit per order field under Reprice for a goal.
[what-price-keeps-this-etsy-profit.html](what-price-keeps-this-etsy-profit.html)
is the same `priceForProfit` arithmetic on its own landing. On the
default $30 listing the current leftover is $21.23; the item price that
keeps $20 is $28.65, $10 is $17.60, and $30 is $39.70. The page does
not recommend a list price.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the calculator does.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.
