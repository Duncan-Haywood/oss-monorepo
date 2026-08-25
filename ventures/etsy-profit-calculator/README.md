# Etsy Profit Calculator

The free Etsy profit calculator shows what an order leaves after listing fees,
transaction fees, payment processing, offsite ads, shipping, materials, and
other per-order costs. Use it before changing a price or publishing a listing.

A second page, `free-shipping.html`, answers the follow-up sellers actually
search: **should I charge shipping or offer free shipping?** Percentage fees
apply to item price plus shipping charged, so moving a label into the item
price is a per-order tie when the buyer pays the same total. Free shipping
only changes the money when you cut (or raise) that total — or when it
brings more orders. The page shows the per-order gap and the extra-order
lift needed to stay even.

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

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and shop data are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor.
Two things are stored locally, on your device only: the numbers you enter (so
they can be restored on your next visit — clear them with **Reset to defaults**)
and, unless you opt out, an anonymous counter that records only an event name
and the day (`order_profit_calculated`, `scenario_compared`, or
`free_shipping_compared`). The counter never records your inputs. A shareable link carries
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

## Free shipping vs charged shipping

Open `free-shipping.html` (linked from the order-profit page). Enter the item
price and shipping you charge today, the item price you would use with free
shipping, and how many orders you typically take in a month. The page compares:

- **Charge shipping** — today's buyer total and profit.
- **Free shipping at your chosen item price** — the gap, and how many extra
  orders that path needs to match this month's contribution.
- **Free shipping at the same item price** — eating the label, which is
  usually worse than raising the price.
- **Absorb the current shipping charge** — the teaching case: same buyer
  total, same profit, because percentage fees already apply to item plus
  shipping charged.

It does not claim a ranking boost or forecast sales. You supply the lift you
think a badge is worth; the arithmetic says whether that lift is enough.
