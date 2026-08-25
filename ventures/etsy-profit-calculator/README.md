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

## Offsite Ads: still worth taking?

Etsy Offsite Ads typically charge **15%** of the order total for shops under
$10,000 in trailing 12-month sales, or **12%** for shops over that threshold.
That fee sits on top of listing, transaction, and payment fees. The calculator
shows the same order at 0%, 12%, and 15%, plus the highest Offsite Ads rate
that still leaves the order above break-even.

A worked example lives at
[`are-etsy-offsite-ads-worth-it.html`](are-etsy-offsite-ads-worth-it.html): a
$14 print that still clears about $2.44 organically loses about $0.12 at 15%.
The comparison does not assume the sale would have happened without the ad —
it only shows what the attributed fee does to contribution.

After using this, you can now **see whether an Offsite Ads sale still covers
materials and shipping**, which used to take a spreadsheet and a guess at
Etsy's published 12%/15% rates.
