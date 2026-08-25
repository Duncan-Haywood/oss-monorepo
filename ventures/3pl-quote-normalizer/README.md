# 3PL Quote Normalizer

Compare a third-party logistics quote with in-house fulfillment costs before
you sign. Enter the rate-card lines for receiving, storage, pick and pack,
packaging, shipping, returns, fixed fees, and minimum monthly spend. The
browser calculates a comparable monthly total, cost per order, and the first
volume where the full 3PL estimate reaches the in-house estimate. The
break-even search includes variable charges, fixed fees, and minimum monthly
spend; a result of zero means the 3PL does not become cheaper within the
supported volume range. Enter a second provider's normalized monthly total to
compare two quotes at the same volume before negotiating.
Use [Volume sensitivity](./sensitivity.html) to see how minimum charges and
true cost per order change at 25, 50, 100, 250, and 500 monthly orders.
If a pasted value is malformed or negative, the copied line-by-line report
includes an explicit warning instead of hiding the normalization rule.

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
leave the browser. The product is free while demand is measured. There is no
payment collection.
