# 3PL Quote Normalizer

Compare a third-party logistics quote with in-house fulfillment costs before
you sign it. Enter the order volume, storage, receiving, pick-and-pack,
packaging, shipping, returns, fixed fees, and minimum monthly spend from a
provider quote. The browser calculates the true monthly cost, cost per order,
the fee that drives the total, and the volume where in-house fulfillment would
cost the same.

This is useful for small ecommerce brands evaluating a new 3PL or checking an
existing invoice. It is intentionally local-first: the calculation works
without an account, API key, or network request, and the inputs never leave
your browser.

## Run it

Open `index.html` directly in a browser, or serve this directory with any
static web server. To run the math tests:

```sh
node --test calc.test.mjs
```

Use the result as a quote-review draft. Add provider-specific fees to the
closest line and change one assumption at a time to see its effect. The tool
does not know whether a provider's quote is accurate or whether in-house
fulfillment is operationally available.

## Privacy and usage

Everything runs in your browser. Your quote data is never uploaded, and there
are no accounts, cookies, or analytics vendors. The product counts only local,
aggregate feature events such as `quote_normalized` and `summary_copied`.
Counting is off-switchable with the button in the result panel; disabling it
deletes the local counter. No IP address, user agent, identifier, or quote
content is collected.

## Legal limitation

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

## License

MIT. See [LICENSE](LICENSE).
