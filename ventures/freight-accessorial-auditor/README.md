# Freight Accessorial Invoice Auditor

Small shippers and freight brokers can now audit billed accessorial lines for duplicates, amounts above an expected contract figure, missing codes, and missing or contradictory evidence — then copy a factual review draft and download a CSV. Sibling pages compare a detention line to the dock clock after free time, and compare eating an extra versus billing the customer versus paying first and reviewing for a credit.

**After using this, you can now** identify invoice lines worth handing to AP with a dated review record, which used to take a manual spreadsheet pass against the rate confirmation.

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. It works without an account, API key, or paid service. It is distinct from a 3PL quote normalizer: this audits billed invoice lines after service, rather than comparing prospective fulfillment quotes.

## What it does

- Flags duplicate lines, billed amounts above expected, missing accessorial codes, and invalid or negative amounts.
- Ranks a line as high / review / supported / fix-inputs from the overage and the evidence status you select.
- Copies a factual dispute-review draft that lists only actionable overages and never determines that a charge is wrong.
- Downloads a private CSV review queue (invoice labels stay local).
- Compares a detention bill to clock time after free time (`should-i-dispute-this-detention-charge.html`).
- Compares eating a billed extra, invoicing the customer, or paying first and reviewing for a credit (`should-i-bill-this-accessorial-to-the-customer.html`).
- Runs without an account, API key, network call, or paid dependency.
- Includes crawler-readable metadata, JSON-LD, sitemap, and `robots.txt`.

## Run it

Open `index.html` directly, or:

```sh
python3 -m http.server 8878 --directory ventures/freight-accessorial-auditor
```

Then open `http://localhost:8878`.

## Default demo

The landing page starts with two $125 liftgate lines on INV-1 (expected $75, evidence missing) and a $20 uncoded line that matches its expected amount. That is **$100.00 above expected** across **3 flagged of 3 lines**, **2 actionable**.

The detention page starts with 180 minutes on dock, 120 free, $75/hour, and a $300 billed line. The clock leaves **1.00 billable hour — $75.00 expected**. The invoice bills **$300.00 as if 4.00 hours**, **$225.00 above the clock**.

The pass-through page starts with **$180.00 already collected**, a **$300.00** billed extra against **$75.00 supported**, a **$300.00** customer back-charge, and **1.5 hours** of review at **$42/hr**. Eating keeps **−$120.00**. Billing the customer keeps **$180.00**. A credit after **$63.00** labor keeps **$42.00**. No credit keeps **−$183.00**.

## Research and business case

Target users are ecommerce brands, small shippers, and freight brokers who pay LTL invoices in AP. Their painful question is not the line-haul rate; it is whether detention, liftgate, residential, reweigh, and lumper charges match the contract and the shipment record — and, once the line is billed, who holds the cash. Carrier portals show the billed line. Spreadsheets do not rank evidence or compare eat / pass-through / review. This tool is local-first, searchable for “freight accessorial audit”, “should I dispute this detention charge?”, and “should I bill this accessorial to the customer?”, and produces a review record rather than a determination.

The product can later support a user-supplied rate-confirmation import or a customer-managed API key for optional document parsing. It does not need those features to deliver value today. Hosting is static and marginal cost is zero.

This is a different product from `3pl-quote-normalizer` (prospective warehouse quotes) and from trade bid calculators. Overlap checked 2026-08-26: #1379 shipped the multi-line audit, CSV, and tests (conflicted); #1436 shipped a one-line evidence + dispute-draft stub (conflicted). Neither is on `main`. This branch salvages the #1379 engine onto current `main`, ports evidence status and the dispute draft from #1436 onto the multi-line queue, and adds the detention clock extra.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. We count anonymous events (which features get used, nothing about who used them). Uncheck the box on the page to turn counting off. Do Not Track and Global Privacy Control disable counting automatically.

## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, legal, or freight-audit advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```
