# Walmart Marketplace Fee Calculator

A free Walmart Marketplace calculator for sellers. It compares **Walmart
Fulfillment Services (WFS)** against **seller fulfilled** on the same
listing — referral fee (including the per-item floor that bites cheap
SKUs), size-tier WFS fulfillment, monthly storage, inbound, and the
shipping label you buy yourself — then reports net profit, margin, return
on the cash in the unit, the break-even sale price, the price that hits a
target margin, the **maximum you can pay for inventory**, whether
**matching a lower offer still leaves a profit**, whether a
**seller-fulfilled 2-day label still beats WFS after take rate**,
whether **WFS still beats seller fulfilled after Walmart returns**,
whether **pulling leftover WFS units still beats aged storage**, and
whether **Walmart Connect extra units still cover last-click ACOS**,
and whether **matching a lower offer still beats holding the list
after Buy Box take**.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Walmart will charge: enter the rates from your
current Seller Center fee preview, and verify them there.

**Copy shareable link** puts the whole scenario — every field above — in the
URL, so you can bookmark one SKU, send it to a partner or VA, or come back to
it tomorrow without re-typing referral rate, dimensions, take rates, return
mix, and ad spend. Nothing is uploaded; the values ride in the URL fragment,
which browsers never send to a server.

**After using this, you can now see whether WFS or shipping it yourself
leaves more on a real SKU, the most you can pay a supplier, whether a
price-match still works, whether buying a 2-day label yourself still
beats WFS once take rate is in the mix, whether returns flip WFS
versus the label you already bought, whether leftover units already
inbound still belong in WFS, and whether extra Walmart Connect units
still cover last-click ACOS on sales you already had, and whether
**winning more of the Buy Box at a lower ticket still beats holding
the list** — which used to mean a spreadsheet that forgot the referral
floor, WFS storage, the match, the Buy Box, return processing, aged
storage, ad attribution, or take rate on a price drop.

## Why it's different

Most “Walmart seller fee calculator” pages apply one referral percentage
and stop. The decisions sellers actually make are the fulfillment path and
the match:

- **WFS** — category referral (or the per-item minimum) + size-tier
  fulfillment + inbound + storage while the unit sits.
- **Seller fulfilled** — the same referral, no WFS fulfillment or storage,
  plus the shipping you pay to send the order.
- **Price match** — the same costs at a lower offer, which is the squeeze
  Walmart listings take that Amazon FBA pages do not model.
- **2-day vs WFS** — WFS includes the two-day promise; a seller-fulfilled
  2-day label plus pack time usually converts more than standard shipping
  and still often loses to WFS after inbound. The completed-sale table
  cannot show that gap.
- **Returns vs WFS** — a refunded order usually keeps the WFS pick fee
  and adds return processing, while seller fulfilled already spent the
  outbound label and then buys a return label. The completed-sale table
  cannot show that mix.
- **Aged leftover vs a removal** — inbound and cost of goods are already
  spent. Aged storage bills what is still sitting. Pulling the pile and
  selling it yourself is a different leftover than a new inbound or a
  refund.
- **Walmart Connect vs skip** — the ads-per-unit line is one leftover on
  a completed sale. Extra units ads buy, and last-click billing on
  organic sales you already had, are a different mix.
- **Hold vs match vs promo** — the match field holds take fixed. A
  lower ticket that wins more of the Buy Box, or a time-boxed promo
  that reverts before competitors react, is a different leftover.

This tool keeps every assumption editable, fills illustrative US defaults
from a category and storage picker, classifies a WFS size tier from
dimensions and weight, and shows **both paths on the same listing**.

[WFS vs seller fulfilled: which path leaves more?](wfs-vs-seller-fulfilled.html)
answers the completed-sale question.
[Should I offer 2-day shipping on Walmart?](should-i-offer-two-day-shipping-on-walmart.html)
mixes take rate with the faster label.
[Should I stay on WFS after Walmart returns?](should-i-use-wfs-with-walmart-returns.html)
mixes a refunded-order leftover with the completed sale.
[Should I pull aged WFS inventory?](should-i-pull-aged-wfs-inventory.html)
mixes aged storage on leftover units with a removal you sell yourself.
[Should I run Walmart Connect ads?](should-i-run-walmart-connect-ads.html)
mixes extra ad units with last-click ACOS on organic sales.
[Should I match the lower Walmart offer?](should-i-match-the-walmart-buy-box.html)
mixes take rate with a permanent match and a time-boxed promo.
[Does a smaller box cut my WFS fee?](does-a-smaller-box-cut-wfs-fees.html)
is the one decision here that leaves the price alone: it compares the
carton as shipped against a repack, names which measurement is over the
Standard ceiling and by how much, and nets the repack labour off the fee
step it saves.

It is not an Amazon FBA calculator, not a Faire wholesale fee tool, and
not a cross-channel “where to sell” ranker. Those already exist in this
portfolio. This page is Walmart Marketplace only.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and inventory data
are never uploaded. There are no accounts, cookies, tracking pixels, or
analytics vendors. The optional local counter records only the event name
and day in your browser; it never records the inputs. Turn it off with the
checkbox in the footer, or your browser's Do Not Track / Global Privacy
Control setting.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # runs calc.test.mjs, usage.test.mjs, page.test.mjs, two-day-page.test.mjs, returns-page.test.mjs, aged-page.test.mjs, ads-page.test.mjs, and match-page.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic, size-tier classification,
referral floor, and category presets; `usage.mjs` holds the anonymous
local counter; `index.html` is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name
is owner-gated per `portfolio/DIRECTION.md` — but the page is ready to
host as static files.
