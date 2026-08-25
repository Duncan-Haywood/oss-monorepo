# 3PL Quote Normalizer

Compare a third-party logistics quote with in-house fulfillment costs before
you sign. Enter the rate-card lines for receiving, storage, pick and pack,
packaging, shipping, returns, return handling, restocking, fixed fees, and
minimum monthly spend. The
browser calculates a comparable monthly total, cost per order, and an
approximate break-even volume. Enter a second provider's normalized monthly
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
After normalizing, use **Download CSV record** to save the exact on-screen
calculation for a spreadsheet or quote review without retyping figures.
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
anonymous feature events such as a quote normalization or copied summary. Use
the opt-out control to delete and disable the counter.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

The result is an arithmetic comparison of your inputs, not a carrier quote,
financial recommendation, or claim that one fulfillment method is suitable for
your business. Verify every rate, assumption, contract term, and operational
requirement yourself.

## Development

```sh
node --test calc.test.mjs
```

The page saves the current form values in browser local storage and restores
them on the next visit, so recurring quote reviews do not require retyping a
rate card. It also copies a line-by-line negotiation report. Saved values never
leave the browser. The quote comparison page counts completed and copied
comparisons, target views, and savings views as anonymous local events. The
product is free while demand is measured. There is no payment collection.
