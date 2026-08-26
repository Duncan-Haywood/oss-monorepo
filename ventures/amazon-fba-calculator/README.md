# Amazon FBA vs FBM Profit Calculator

A free Amazon FBA calculator for sellers. It compares **Fulfillment by
Amazon** against **merchant fulfilled (FBM)** on the same listing — referral
fee, size-tier fulfillment, monthly storage, inbound, and the shipping label
you buy yourself — then reports net profit, margin, return on the cash in the
unit, the break-even sale price, the price that hits a target margin, and the
**maximum you can pay for inventory** before the unit loses money.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Amazon will charge: enter the rates from your current
fee preview, and verify them there.

**After using this, you can now see whether FBA or FBM leaves more on a real
SKU, the most you can pay a supplier for that unit, whether staying under
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
rate still leaves expected profit after handling and unsellable units** —
which used to mean a spreadsheet that forgot storage, inbound, or the
pick-fee jump at $10.

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
months, and the conversion lift that still ties.

Units that already sit are a leftover-pile decision on the same SKU:
keep paying storage and the aged-inventory surcharge, pay to send
them back, or pay to dispose.
[Should I remove aged Amazon inventory?](should-i-remove-aged-amazon-inventory.html)
shows leftover cash, leftover units, and the monthly sell-through
that still ties dispose. Complementary to Q4 storage (a seasonal
rate) and to 3PL long-term storage (a different warehouse).

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

## Privacy and usage

Everything runs in your browser. Your prices, costs, and inventory data are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
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
node --test        # runs calc.test.mjs, usage.test.mjs, page.test.mjs, vine-page.test.mjs, aged-inventory-page.test.mjs, inbound-page.test.mjs, and returns-page.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic, size-tier classification,
category presets, coupon comparison, Subscribe & Save comparison,
Multi-Channel Fulfillment comparison, usual-PO vs supplier-MOQ
comparison, you-prep vs Amazon inbound prep comparison,
Individual vs Professional seller-plan comparison,
Vine leftover vs sellable enrollment comparison,
aged-inventory keep vs return vs dispose comparison,
inbound placement vs split-freight comparison, and
expected profit after returns;
`usage.mjs` holds the anonymous
local counter; `index.html` is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
