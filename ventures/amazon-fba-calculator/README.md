# Amazon FBA vs FBM Profit Calculator

A free Amazon FBA calculator for sellers. It compares **Fulfillment by
Amazon** against **merchant fulfilled (FBM)** on the same listing — referral
fee, size-tier fulfillment, monthly storage, inbound, the shipping label
you buy yourself, and the **low-inventory-level surcharge** when both
supply windows sit below 28 days — then reports net profit, margin, return
on the cash in the unit, the break-even sale price, the price that hits a
target margin, and the **maximum you can pay for inventory** before the
unit loses money.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Amazon will charge: enter the rates from your current
fee preview, and verify them there.

**After using this, you can now see whether FBA or FBM leaves more on a real
SKU, the most you can pay a supplier for that unit, and whether restocking
to 28 days beats paying the low-inventory-level fee** — which used to mean
a spreadsheet that forgot storage, inbound, or the professional plan.

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
units, and shows **both paths on the same listing**.

[FBA vs FBM: which path leaves more?](fba-vs-fbm.html) answers that search
question directly.
[Low-inventory-level fee: restock or stay thin?](low-inventory-level-fee.html)
answers the restock decision.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

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
node --test        # runs calc.test.mjs, usage.test.mjs, and page.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic, size-tier classification, and
category presets; `usage.mjs` holds the anonymous local counter; `index.html`
is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
