# Walmart Marketplace Fee Calculator

A free Walmart Marketplace calculator for sellers. It compares **Walmart
Fulfillment Services (WFS)** against **seller fulfilled** on the same
listing — referral fee (including the per-item floor that bites cheap
SKUs), size-tier WFS fulfillment, monthly storage, inbound, and the
shipping label you buy yourself — then reports net profit, margin, return
on the cash in the unit, the break-even sale price, the price that hits a
target margin, the **maximum you can pay for inventory**, and whether
**matching a lower offer still leaves a profit**.

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
an estimate of the fees Walmart will charge: enter the rates from your
current Seller Center fee preview, and verify them there.

**After using this, you can now see whether WFS or shipping it yourself
leaves more on a real SKU, the most you can pay a supplier, and whether a
price-match still works** — which used to mean a spreadsheet that forgot
the referral floor, WFS storage, or the match.

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

This tool keeps every assumption editable, fills illustrative US defaults
from a category and storage picker, classifies a WFS size tier from
dimensions and weight, and shows **both paths on the same listing**.

[WFS vs seller fulfilled: which path leaves more?](wfs-vs-seller-fulfilled.html)
answers that search question directly.

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
node --test        # runs calc.test.mjs, usage.test.mjs, and page.test.mjs
```

`calc.mjs` holds the fee/profit/ROI arithmetic, size-tier classification,
referral floor, and category presets; `usage.mjs` holds the anonymous
local counter; `index.html` is the calculator UI.

Not yet deployed to a public URL — publishing under the portfolio's name
is owner-gated per `portfolio/DIRECTION.md` — but the page is ready to
host as static files.
