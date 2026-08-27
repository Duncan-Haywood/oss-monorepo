# 3PL Quote Normalizer

Compare a third-party logistics quote with in-house fulfillment costs before
you sign. Enter the rate-card lines for receiving, storage, pick and pack,
packaging, shipping, returns, return handling, restocking, fixed fees, and
minimum monthly spend. The
browser calculates a comparable monthly total, cost per order, and an
approximate break-even volume that re-prices the quote as order count changes, instead of dividing this month's total by the in-house rate. Enter a second provider's normalized monthly
total to compare two quotes at the same volume before negotiating. The comparison
page validates totals before rendering and remembers its draft locally. Optionally
enter a target monthly total to see which provider fits your budget and how far
an over-target quote must move. Optional provider names make the result easier to
share, and the page shows monthly, annual, and percentage savings against the
higher quote.
Download the comparison as a named CSV record for spreadsheet review, including
an optional target-budget decision and the review safeguard.
Use [Volume sensitivity](./sensitivity.html) to see how minimum charges and
true cost per order change at 25, 50, 100, 250, and 500 monthly orders.
Use [When return fees flip the quote](./returns-sensitivity.html) to hold the
rest of the rate card still and raise the return rate. That shows the first
rate where in-house is cheaper, and whether a monthly minimum is hiding the
returns line until the subtotal clears the floor.
Use [Does long-term storage flip a 3PL quote](./does-long-term-storage-flip-a-3pl-quote.html)
to put leftover pallets on the long-term storage line the signed card usually
omits. That shows the monthly surcharge versus the quote as written, whether
that aged path still beats in-house, and how many months of the hold eat a
liquidation recovery. The main calculator runs the same
`compareAgedStorage` math on the quote you just typed, so you do not leave
the page to check leftover long-term storage.
Use [Should I restock a 3PL return or let the customer keep it](./should-i-restock-or-let-the-customer-keep-a-3pl-return.html)
to price a return that just arrived — restock sellable units, destroy the
unit, or skip the label and let the customer keep it. That is a different
decision from leftover pallets already on the floor and from raising the
return rate against in-house. The table names the unit-cost and restockable-rate
flips. The main calculator runs the same
`compareReturnDisposition` math on the quote you just typed, so you do
not leave the page to check restock vs destroy vs customer-keeps.
Use [Should I pay the 3PL to kit, or skip the bundle](./should-i-pay-the-3pl-to-kit.html)
to price assembly, extra component picks, and extra receiving against
kitting before inbound and against selling the hero SKU. That is a different
decision from leftover pallets, from return rates, and from restock vs keep.
The table names the kit-fee and AOV-lift flips. The main calculator runs the
same `compareKitting` math on the quote you just typed, so you do not leave
the page to check whether the kit fee still beats skipping the bundle.
Use [Create a 3PL negotiation brief](./negotiation.html) to turn two
normalized monthly totals into a factual ask — the gap, not a recommended
provider.
Use [Rank the largest rate-card lines](./drivers.html) to sort the same
normalized quote by monthly cost and see what a typed percent reduction
would change on each line. That is a different question from the two-quote
brief: it names the line, not the provider.
Use [Which inbound method is cheaper](./inbound.html) to convert pallet,
carton, and loose receiving into the same per-unit rate and see which line
wins at your inbound volume. A monthly minimum can hide a real receiving
gap; the table names that case. That is a different decision from leftover
pallets already on the floor, from restock vs keep, and from kitting.
The same comparison now also runs on the [main calculator](./index.html)
from the quote you already typed.
The [pallet vs carton inbound](./pallet-vs-carton-inbound.html) page walks
the fee ÷ units arithmetic.
Use [Download a reviewable 3PL record](./export.html) when you want that
CSV or JSON from a dedicated page — it loads the quote saved on the
calculator in this browser.
After normalizing, use **Download CSV record** to save the exact on-screen
calculation for a spreadsheet, or **Download JSON record** for a procurement or
ERP adapter, without retyping figures. The JSON record is versioned and includes
only calculated values, warnings, and review safeguards; it does not include the
raw rate-card fields.
If a pasted value is malformed or negative, the copied line-by-line report
includes an explicit warning instead of hiding the normalization rule.
Blank fields are also called out with the default value used, so a missing
line on a rate card cannot look like a verified zero or custom quote input.
Return handling and restocking default to $2.50 and $0.40 per returned order;
the calculator page exposes both assumptions for rate-card-specific estimates.

## Run it

Serve this directory with any static HTTP server, then open `index.html`:

```sh
python3 -m http.server 8876 --directory ventures/3pl-quote-normalizer
```

The arithmetic is deterministic and works without an account, API key, upload,
or paid service. Use **Copy summary** to take the decision snapshot into a
quote review or negotiation note. All entered data and anonymous feature
counts stay in the browser's local storage.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and this product
has no accounts, tracking cookies, or analytics vendor. It counts only local,
anonymous feature events such as a quote normalization, a kitting comparison,
an inbound-method comparison, or a copied summary. Use the opt-out control to
delete and disable the counter.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your inputs
and run it yourself.

The result is an arithmetic comparison of your inputs, not a carrier quote,
financial recommendation, or claim that one fulfillment method is suitable for
your business. Verify every rate, assumption, contract term, and operational
requirement yourself.

## Development

```sh
node --test calc.test.mjs page.test.mjs
```

The page saves the current form values in browser local storage and restores
them on the next visit, so recurring quote reviews do not require retyping a
rate card. It also copies a line-by-line negotiation report. Saved values never
leave the browser. The quote comparison page counts completed and copied
comparisons, target views, and savings views as anonymous local events. The
product is free while demand is measured. There is no payment collection.
