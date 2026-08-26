# Etsy Profit Calculator

The free Etsy profit calculator shows what an order leaves after listing fees,
transaction fees, payment processing, offsite ads, shipping, materials, and
other per-order costs. Use it before changing a price or publishing a listing.

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

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the calculator does.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.
