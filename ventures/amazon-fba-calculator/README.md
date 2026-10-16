# Amazon FBA vs FBM Profit Calculator

A free Amazon FBA calculator for sellers. It compares **Fulfillment by
Amazon** against **merchant fulfilled (FBM)** on the same listing — referral
fee, size-tier fulfillment, monthly storage, inbound, and the shipping label
you buy yourself — then reports net profit, margin, return on the cash in the
unit, the break-even sale price, the price that hits a target margin, and the
**maximum you can pay for inventory** both before the unit loses money and
while preserving your target margin.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/amazon-fba-calculator/

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Amazon will charge: enter the rates from your current
fee preview, and verify them there.

**Save current inputs** keeps named sourcing scenarios (a restock, an FBM
test) in this browser so you can switch between them without retyping. Nothing
is uploaded. **Copy decision summary** writes leftover profit, margin, max buy,
and FBA vs FBM into the clipboard.

**After using this, you can now see whether FBA or FBM leaves more on a real
SKU, the most you can pay a supplier for that unit, the highest ACOS each
path can still carry, whether staying under
Amazon’s Low-Price FBA threshold still beats a real raise, and whether a
coupon still hits your target after the redemption fee, whether
Subscribe & Save still pays when only some units enroll, whether a
website order shipped MCF still beats selling the unit on Amazon,
whether a supplier MOQ still pays after the extra warehouse stay, and
whether paying Amazon to prep inbound still beats you-prep, and
whether Individual or Professional still pays at your monthly volume, and
whether an Amazon Vine enrollment still pays after gifted leftover units
versus units that would have sold, whether Amazon inbound placement
still beats extra freight on a split shipment, and whether a return
rate still leaves expected profit after handling and unsellable units, and
whether sending inventory before Q4 still beats waiting until January,
and whether a smaller carton still drops a size-tier fee cliff, and
whether Seller Fulfilled Prime still beats FBA after a 2-day label
and pack time, and whether Amazon AWD still beats sending the whole
lot to FBA after receive, transfer, and bulk storage, and
whether Amazon Remote Fulfillment still beats skipping Canada
or sending a dedicated Canada pile** —
which used to mean a spreadsheet that forgot storage, inbound, or the
0.75-inch small-standard gate.

## Why it's different

Most “Amazon FBA fee calculator” pages apply one referral percentage and stop.
The decision sellers actually make is the fulfillment path:

- **FBA** — category referral + size-tier fulfillment + inbound + storage
  while the unit sits.
- **FBM** — the same referral, no Amazon fulfillment or storage, plus the
  shipping you pay to send the order.

This tool keeps every assumption editable, fills illustrative US defaults from
a category and storage-season picker, classifies a size tier from dimensions
and weight, allocates the professional seller plan across expected monthly
units, compares that plan to Individual’s per-item selling fee, and shows
**both fulfillment paths on the same listing**.

[FBA vs FBM: which path leaves more?](fba-vs-fbm.html) answers that search
question directly.
[This calculator vs. Amazon's own Revenue Calculator](vs-amazon-revenue-calculator.html)
says which of the two to open for which question — Amazon's own tool is the
authoritative live fee lookup for one listing; this one is the FBA-vs-FBM
decision, max buy cost, and the dozen follow-on scenarios built from your own
numbers. Not affiliated with Amazon.
[Should I stay under Low-Price FBA?](should-i-price-over-amazons-low-price-fba.html)
answers the $9.99-versus-$12 pricing question: a one-cent raise usually
loses, and the raise that matches the cheaper pick fee is
`stayPrice + (regularFee − lowPriceFee) / (1 − referralRate)`.

A coupon is a second decision on the same SKU. The buyer pays less, so
referral falls, but fulfillment does not, and Amazon adds a per-redemption
fee. [Does this Amazon coupon still pay?](does-this-amazon-coupon-still-pay.html)
compares list against 5%, 10%, 15%, and 20%, then shows the volume lift
needed to match this month’s list-price profit.

Subscribe & Save is the standing version of that discount: same
referral cut, typically no redemption fee, and only a share of units
enroll. [Does Subscribe & Save still pay?](does-subscribe-and-save-still-pay.html)
compares list against 5%, 10%, and 15%, then shows the mixed month and
the new S&S-only sales that would offset converted buyers.

A website order on the same FBA unit is a further decision. MCF skips
Amazon referral and pays a higher pick fee plus your card processor.
[Should I use Amazon MCF for website orders?](should-i-use-amazon-mcf-for-website-orders.html)
shows leftover profit against Amazon FBA and against shipping it
yourself, and the MCF fee that still matches Amazon.

A supplier MOQ is a sourcing decision on the same SKU: a cheaper unit
that sits longer and ties up more cash.
[Does this Amazon supplier MOQ still pay?](does-this-amazon-moq-still-pay.html)
scales the listing months by pile size, then shows leftover per unit,
extra cash, and the MOQ cost that still matches the usual purchase
order.

Paying Amazon to label, bag, or wrap inbound is a prep decision on
the same SKU. You-prep is already in the listing; Amazon’s inbound
prep fees replace that line.
[Should I pay Amazon to prep inbound?](should-i-pay-amazon-to-prep-inbound.html)
shows leftover profit, the monthly gap, and the Amazon fee that
still matches you-prep.

The selling plan is a further account decision on the same SKU:
Individual charges per item sold; Professional is a flat month.
[Individual vs Professional: when does the monthly plan pay?](individual-vs-professional.html)
applies both to leftover profit and max buy. At the illustrative
US defaults the subscription matches the per-item fee at about
40.4 units a month. A volume ladder at 10, 20, 40, 80, and 200
units shows when the $0.99/item fee flips as sales grow.

A Vine invite is a launch decision on the same SKU: gift leftover
units, gift units that would have sold, or skip.
[Is Amazon Vine worth it?](is-amazon-vine-worth-it.html)
shows enrollment cost after the pick fee, leftover over the typed
months, and the conversion lift that still ties. The main calculator
runs the same `compareVine` math on the listing you just typed, so you
do not leave the page to check leftover enrollment versus skip.

Units that already sit are a leftover-pile decision on the same SKU:
keep paying storage and the aged-inventory surcharge, pay to send
them back, or pay to dispose.
[Should I remove aged Amazon inventory?](should-i-remove-aged-amazon-inventory.html)
shows leftover cash, leftover units, and the monthly sell-through
that still ties dispose. Complementary to
[peak vs off-peak Q4 storage](peak-vs-off-peak-storage.html) (a seasonal
rate) and to 3PL long-term storage (a different warehouse).

FBA Liquidations is the recovery on that same leftover pile: Amazon
pays a percent of list, or you pay the return-removal fee and sell
the units on eBay, your site, or a jobber.
[Should I liquidate aged FBA inventory?](should-i-liquidate-aged-fba-inventory.html)
shows leftover cash after recovery, the elsewhere leftover that still
ties liquidations, and the monthly sell-through that still ties.

Units that are still selling, but sitting thin, are a quantity
decision on the same SKU: pay the low-inventory-level surcharge on
each FBA shipment, or send enough units to cover 28 days.
[Does restocking beat the low-inventory-level fee?](low-inventory-level-fee.html)
shows both historical windows, the surcharge band, extra inbound,
and extra storage. Complementary to aged-inventory removal (units
that already sit) and to Q4 peak storage (when the cube sits).

**After using the low-inventory page, you can now see whether 10
on-hand units at 1 sale/day still lose $26.70 / month to the
surcharge, and that restocking 18 units avoids $25.83 / month after
$0.87 extra storage** — which used to mean staying thin because
28 days looked like extra warehouse cost. The same comparison now
also runs on the [main calculator](index.html) from the listing you
already typed.

Inbound placement is a create-shipment decision on the same SKU: pay
Amazon to accept one warehouse, or pay extra freight to follow the
split.
[Is Amazon inbound placement cheaper than splitting the shipment?](inbound-placement-fee.html)
keeps freight and the per-unit placement fee on separate lines so a
blended inbound / unit does not hide the cheaper total. Complementary
to you-prep vs Amazon inbound prep (who labels the unit, not where it
lands).

Returns are a mix on the same SKU: a completed sale keeps the leftover,
a return typically refunds the buyer and the referral, and the outbound
pick fee plus inbound stay spent. Cost of goods comes back only when
the unit can be sold again.
[Do Amazon returns wipe FBA profit?](do-amazon-returns-wipe-the-profit.html)
shows expected profit, the drag at 0 / 8 / 15 / 22%, and the return
rate that takes leftover to zero. Complementary to aged-inventory
removal (units that already sit) and to eBay’s return-rate view (a
different marketplace).

**After using the aged-inventory page, you can now see whether
keeping 80 leftover units at 5% sell-through still beats a $0.32
dispose after $1.50 / unit / month surcharge** — which used to mean
leaving the pile because removal looked like giving up.

**After using the liquidation page, you can now see whether pulling
80 leftover $29.99 units and selling them elsewhere at $4 leftover
keeps $68.86 more than an 8% FBA Liquidations recovery ($236.80 vs
$167.94), and that elsewhere leftover can fall to about $3.14
before liquidations match** — which used to mean disposing the pile
because Amazon’s recovery percent looked like the only exit. The
same comparison now also runs on the [main calculator](index.html)
from the listing you already typed.

**After using the Vine page, you can now see whether leftover units
still beat skipping after a $419.95 gift, and why a hero SKU that
would have sold usually does not** — which used to mean accepting
the Vine invite because 30 reviews looked free.

**After using the inbound-placement page, you can now see whether
sending 200 large-standard units to one warehouse at $85 freight plus
$0.43 placement still beats $210 on Amazon’s split** — which used to
mean following the split because the placement fee looked optional.

**After using the returns page, you can now see whether a 15% return
rate with $2.50 handling still leaves $7.75 on a $29.99 listing that
looked like $10.99** — which used to mean buying the SKU because the
completed-sale leftover looked fat.

**After using the peak-storage page, you can now see whether sending
200 one-cubic-foot units for a three-month stay with two peak months
still costs $612 more than waiting until January** — which used to
mean inbound in August because stock-out looked more expensive than
storage.

A carton that just crossed 0.75 inch or 1 lb is a packaging decision
on the same SKU: stay in the current size tier, flatten into the
next-lower tier if the unit still fits, or drop only a fulfillment
weight band.
[Does a smaller box cut Amazon FBA fees?](does-smaller-box-cut-amazon-fba-fees.html)
shows leftover per unit and extra prep so a cheaper ounce band is
not confused with a cheaper size tier. Complementary to
[Q4 peak storage](peak-vs-off-peak-storage.html) (when the unit sits)
and to [Amazon inbound prep](should-i-pay-amazon-to-prep-inbound.html)
(who labels the unit).

**After using the packaging page, you can now see whether flattening
an 8×6×2 carton to 0.75 inch still keeps $0.80 more per unit
($64.02 a month at 80 units) before extra prep** — which used to
mean leaving the box because the fee preview looked like a referral
change.

An SFP invite is a badge decision on the same SKU: keep FBA Prime,
buy a 2-day label yourself, or drop to merchant fulfilled.
[Should I use Seller Fulfilled Prime?](should-i-use-seller-fulfilled-prime.html)
mixes take rate with the 2-day label and pack time so a
completed-sale leftover does not hide a Prime-filter gap.
The main calculator runs the same `compareSfp` math on the listing
you just typed, so you do not leave the page to check the 2-day
label and take-rate gap.
Complementary to [FBA vs FBM](fba-vs-fbm.html) (no Prime take) and
to [MCF for website orders](should-i-use-amazon-mcf-for-website-orders.html)
(a non-Amazon checkout from FBA stock).

**After using the SFP page, you can now see whether an $8.95 2-day
label plus 6 minutes at $18 still loses $4.03 per session ($460.37
on 80 FBA units) against FBA, and that the label has to fall to
about $2.75 before SFP matches** — which used to mean leaving FBA
because the Prime badge looked free to keep.

A fresh supplier PO is an inbound-bulk decision on the same SKU:
send the whole lot to FBA now, park it in Amazon Warehousing and
Distribution and replenish a working FBA stock, or hold it yourself
and drip inbound.
[Should I use Amazon AWD?](should-i-use-amazon-awd.html)
keeps receive, transfer, and bulk storage on separate lines so a
blended inbound / unit does not hide the cheaper pile.
Complementary to [inbound placement](inbound-placement-fee.html)
(which FC), to [aged inventory](should-i-remove-aged-amazon-inventory.html)
(units already sitting), to [Q4 storage](peak-vs-off-peak-storage.html)
(when you send), and to [supplier MOQ](does-this-amazon-moq-still-pay.html)
(how many you buy).

**After using the AWD page, you can now see whether a $0.15 AWD
receive plus a $0.68 transfer still keeps $165.33 more on 400 units
than sending the lot to FBA now ($4723.93 vs $4558.60), and that the
transfer has to rise to about $1.09 before FBA matches** — which used
to mean inbounding the whole PO because AWD looked like an extra hop.

Canada or Mexico demand on a SKU already sitting in US FBA is an
expansion decision: skip that border, fulfill from the US pile with
Remote Fulfillment, or send a dedicated Canada pile.
[Should I use Amazon Remote Fulfillment?](should-i-use-amazon-remote-fulfillment.html)
mixes the remote surcharge with Canada inbound and take rate so a
blended inbound / unit does not hide the first CA shipment.
Complementary to [Amazon AWD](should-i-use-amazon-awd.html)
(where a fresh US PO parks), to
[inbound placement](inbound-placement-fee.html) (which US FC),
to [MCF](should-i-use-amazon-mcf-for-website-orders.html)
(a website order from FBA stock), and to
[Seller Fulfilled Prime](should-i-use-seller-fulfilled-prime.html)
(a US Prime badge).

**After using the Remote Fulfillment page, you can now see whether a
$1.25 remote surcharge still keeps $5.12 more per Canada session
than skipping ($204.86 on 40 sessions) against a $5.20 first Canada
inbound, and that the remote fee has to rise to about $1.75 before
the pile matches** — which used to mean sending a second pile
because local Prime looked free to open.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Keeping a scenario, and arriving from the channel comparison

**Copy link to these numbers** puts every input in the URL, after the `#`. That
link reopens this page with the same scenario, so you can bookmark a SKU, come
back to it after the supplier quote lands, or send it to whoever else has to
agree the restock still pays.

Browsers never send the part of a URL after the `#` to a server, so the numbers
travel only inside the browser of whoever opens the link. Nothing is uploaded,
and no copy of the scenario exists anywhere but in that link.

The same mechanism carries an item in from
[`where-to-sell-calculator`](../where-to-sell-calculator/), which compares one
item across eBay, Etsy, Amazon, an own store and a direct sale, and then offers
**"keep going with this item"** into whichever channel's own calculator goes
deeper. Arriving that way fills in the sale price, what you paid, your own
postage cost, and packaging — the four figures that page knows — and leaves
everything else at this page's starting figures. **Check the referral rate and
the size tier against your own Amazon fee preview before trusting the result**;
they are illustrative defaults, not your account's numbers.

Postage charged to the buyer is deliberately *not* carried across. Amazon
charges its referral fee on the order total, but this page takes the item price
and derives fulfilment from the size tier rather than from what the buyer paid
for postage — so folding postage into the sale price would inflate the referral
fee and print a worse number than you will actually see.

A link that has been truncated or mangled is ignored field by field: anything
unreadable falls back to this page's own starting figure rather than arriving
as a zero that looks like an answer.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and inventory data are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendors. The optional local counter records only the event name and day in your
browser; it never records the inputs — including `share_link_copied` and
`shared_link_opened`, which say that a link was made or followed and nothing
about what was in it. Turn it off with the checkbox in the footer, or your
browser's Do Not Track / Global Privacy Control setting.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # runs calc.test.mjs, share.test.mjs, usage.test.mjs, page.test.mjs, vine-page.test.mjs, aged-inventory-page.test.mjs, inbound-page.test.mjs, returns-page.test.mjs, storage-page.test.mjs, packaging-page.test.mjs, sfp-page.test.mjs, low-inventory-page.test.mjs, awd-page.test.mjs, remote-fulfillment-page.test.mjs, and liquidation-page.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic, size-tier classification,
category presets, coupon comparison, Subscribe & Save comparison,
Multi-Channel Fulfillment comparison, usual-PO vs supplier-MOQ
comparison, you-prep vs Amazon inbound prep comparison,
Individual vs Professional seller-plan comparison,
Vine leftover vs sellable enrollment comparison,
aged-inventory keep vs return vs dispose comparison,
inbound placement vs split-freight comparison,
expected profit after returns,
peak vs off-peak Q4 storage,
Seller Fulfilled Prime vs FBA vs FBM,
restock vs low-inventory-level fee,
Amazon AWD vs send-all-to-FBA vs you-hold,
Remote Fulfillment vs skip Canada vs a Canada FBA pile,
and FBA Liquidations vs dispose vs sell-elsewhere;
`share.mjs` encodes and decodes the scenario link, over the field list
`calc.mjs` exports so the two cannot drift; `usage.mjs` holds the anonymous
local counter (`sourcing_check_used` when the cost-of-goods field changes);
`index.html` is the calculator UI. The buy-cost check is arithmetic against
the zero-profit max-buy ceiling, not a recommendation to buy or pass.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
