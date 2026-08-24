# Shopify Fee & Profit Calculator

A free Shopify fee calculator for merchants. It shows what an order leaves
after **Shopify Payments** or a **third-party processor** (PayPal, Stripe, and
the rest), including the extra Shopify third-party transaction fee that generic
fee pages skip. From the same inputs it reports net profit, margin, return on
the cash you put into the order (plus a share of the monthly plan), the
break-even listing price, and the price that hits a target margin.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Shopify will charge: enter the rates from your current
statements, and verify them there.

**After using this, you can now see whether PayPal or Stripe costs more than
Shopify Payments on a real order, and what to charge to keep a target
margin** — which used to mean a spreadsheet that forgot the extra Shopify fee.

## Why it's different

Most “Shopify fee calculator” pages apply one processing rate. The decision
merchants actually make is the payment path:

- **Shopify Payments** — processing percentage + fixed fee, no extra Shopify
  transaction fee on that path.
- **PayPal / Stripe / other** — the processor’s percentage + fixed fee *plus*
  Shopify’s third-party transaction fee (often 2% / 1% / 0.5% / 0% by plan).

This tool keeps every assumption editable, fills illustrative US online
defaults from a plan picker, allocates the monthly Shopify plan across
expected monthly orders, and shows **both paths on the same order**.

[Why PayPal can cost more on Shopify](why-paypal-costs-more.html) answers that
search question directly.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and shop data are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics
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
node --test        # runs calc.test.mjs and usage.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic and plan presets; `usage.mjs`
holds the anonymous local counter; `index.html` is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
