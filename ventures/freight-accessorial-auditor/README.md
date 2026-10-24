# Freight Accessorial Invoice Auditor

Small shippers and freight brokers can now audit billed accessorial lines for duplicates, amounts above an expected contract figure, missing codes, and missing or contradictory evidence — then copy a factual review draft and download a CSV. Sibling pages compare a detention line to the dock clock after free time, compare a billed fuel surcharge to the contract percent of linehaul, and compare eating an extra versus billing the customer versus paying first and reviewing for a credit.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/freight-accessorial-auditor/

**After using this, you can now** import the carrier's own invoice export, apply your contract rate card once, see whether a billed fuel surcharge matches the contract percent of linehaul, and identify invoice lines worth handing to AP with a dated review record — which used to take a manual spreadsheet pass against the rate confirmation, one line at a time.

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. It works without an account, API key, or paid service. It is distinct from a 3PL quote normalizer: this audits billed invoice lines after service, rather than comparing prospective fulfillment quotes.

## What it does

- **Imports the carrier's invoice export** (`how-to-audit-a-whole-freight-invoice.html`): CSV, tab-separated, or a range pasted out of a spreadsheet. Columns are guessed from their headings and shown for correction; a contract rate card supplies the expected amounts a carrier file never carries.
- **Rates accessorials that are not flat.** A rule can be per unit with a free allowance, a minimum, and a cap — `DET 65/hr after 2 hours, max 325`, `STO $40 per day after 1`, `REWEIGH 4.50/cwt min 45` — priced against a quantity column (hours, days, weight) mapped alongside the amount. Detention, storage, and reweigh are the accessorials most worth auditing and the ones a flat card could not price at all. Every priced line carries the reason it expects what it expects, into the review queue, the CSV, and the dispute draft.
- **Prices lines you type, not just lines you import.** Leave a row's expected amount blank and the rate card fills it from the code and the `Qty / hrs` cell, showing the figure greyed with the contract term behind it. Typing your own figure overrides the card, as a carrier export's own expected column does. Checking one detention charge no longer means building a CSV to import.
- Flags duplicate lines, billed amounts above expected, missing accessorial codes, and invalid or negative amounts.
- Ranks a line as high / review / supported / fix-inputs from the overage and the evidence status you select.
- Copies a factual dispute-review draft that lists only actionable overages and never determines that a charge is wrong.
- Downloads a private CSV review queue (invoice labels stay local).
- Compares a detention bill to clock time after free time (`should-i-dispute-this-detention-charge.html`).
- Compares a billed fuel surcharge to the contract percent of linehaul, with an optional typed bulletin index (`does-this-fuel-surcharge-match-the-contract.html`).
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

The import panel ships a three-code rate card (`LIFT, 75` / `DET 65/hr after 2 hours, max 325` / `RESI, 45`). Feeding it a six-line carrier export with *only import lines whose code is in my rate card* ticked skips line haul and fuel, leaving **4 lines totalling $595.00** of which **$325.00 is above the rate card** across **3 flagged lines** — including a $125.00 liftgate billed twice. `how-to-audit-a-whole-freight-invoice.html` walks that example, and a test recomputes its figures so the write-up cannot drift from the code.

The detention page starts with 180 minutes on dock, 120 free, $75/hour, and a $300 billed line. The clock leaves **1.00 billable hour — $75.00 expected**. The invoice bills **$300.00 as if 4.00 hours**, **$225.00 above the clock**.

The pass-through page starts with **$180.00 already collected**, a **$300.00** billed extra against **$75.00 supported**, a **$300.00** customer back-charge, and **1.5 hours** of review at **$42/hr**. Eating keeps **−$120.00**. Billing the customer keeps **$180.00**. A credit after **$63.00** labor keeps **$42.00**. No credit keeps **−$183.00**.

The fuel page starts with a **$1,200.00** linehaul at **28%**, a **$412.00** billed FSC line, and a typed bulletin of **26% plus 2 points**. The contract expects **$336.00**. The invoice is **34.33% of linehaul**, **$76.00 above the contract**. The index path expects the same **$336.00**.

## Research and business case

Target users are ecommerce brands, small shippers, and freight brokers who pay LTL invoices in AP. Their painful question is not the line-haul rate; it is whether detention, liftgate, residential, reweigh, lumper, and fuel-surcharge charges match the contract and the shipment record — and, once the line is billed, who holds the cash. Carrier portals show the billed line. Spreadsheets do not rank evidence or compare eat / pass-through / review. A flat rate card skips FUEL because the base is linehaul. This tool is local-first, searchable for “freight accessorial audit”, “should I dispute this detention charge?”, “does this fuel surcharge match the contract?”, and “should I bill this accessorial to the customer?”, and produces a review record rather than a determination.

The product can later support a user-supplied rate-confirmation import or a customer-managed API key for optional document parsing. It does not need those features to deliver value today. Hosting is static and marginal cost is zero.

This is a different product from `3pl-quote-normalizer` (prospective warehouse quotes) and from trade bid calculators. Overlap checked 2026-08-26: #1379 shipped the multi-line audit, CSV, and tests (conflicted); #1436 shipped a one-line evidence + dispute-draft stub (conflicted). Neither is on `main`. This branch salvages the #1379 engine onto current `main`, ports evidence status and the dispute draft from #1436 onto the multi-line queue, and adds the detention clock extra.

## Privacy and usage

Everything runs in your browser, including the invoice file you import — it is read with the browser's local file reader and never uploaded. We don't have accounts, tracking cookies, or an analytics vendor. We count anonymous events (which features get used, nothing about who used them). Uncheck the box on the page to turn counting off. Do Not Track and Global Privacy Control disable counting automatically.

## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, legal, or freight-audit advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```

## Per-unit rate rules

Units understood are hour, minute, day, cwt, pound, pallet, piece, mile, stop,
and unit. Clause order does not matter. Two rules keep a wrong number from
reaching a carrier:

- **A per-unit code with no quantity leaves the expected amount blank**, with
  the reason shown, and is excluded from the headline recoverable figure. A
  $0.00 expectation would report the whole billed line as recoverable.
- **A quantity in the wrong unit is refused, not converted.** The two
  exceptions are minutes against a per-hour rate and pounds against a
  per-hundredweight rate, both stated on the line — carrier exports report
  dock time both ways, and reading 210 minutes as 210 hours would put
  $13,000 of expected detention on a $300 line; a weight column is pounds far
  more often than it is hundredweight, so without the second exception a
  REWEIGH rule written `/cwt` — the normal way a rate confirmation states one
  — could never be priced from an imported invoice at all.

A contract minimum applies only to a line with billable units, so a shipment
that left inside its free time still expects $0.00 rather than the minimum.
