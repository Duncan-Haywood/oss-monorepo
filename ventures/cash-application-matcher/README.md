# Cash Application Matcher

**Which invoices did this payment pay?** A free, private tool for accounts-receivable clerks and bookkeepers that reads an open-invoice export and a bank export of incoming payments and proposes, for every receipt, which invoices it settles: one payment for several invoices, early-payment discounts ("2/10 net 30"), bank charges the payer's bank kept, short-pays and cheques with no name. Each proposal has a confidence and a one-sentence reason.

**Live tool:** https://marisstella.app/cash-application-matcher/

**After using this, you can now** post a morning's bank receipts from a list that says "INV-1006 and INV-1007, less a 15.00 wire fee", **which used to take** adding up combinations of a customer's open invoices on a calculator until one matched.

## Use it

- **Browser:** open [`index.html`](index.html) (or the live page), choose the two CSV files, press **Match payments**, download the applications CSV. **Load the worked example** runs the made-up files in [`examples/`](examples/).
- **CLI:** `node cli.mjs examples/open-invoices.csv examples/bank-receipts.csv --out applications.csv` (`--fee 25`, `--no-discounts`, `--day-first`, `--json`).

The applications CSV has one line per invoice application: receipt, invoice, amount applied, discount taken, short-pay write-off, balance left open, unapplied cash, method, confidence and what to check.

## How it decides

The order is the one an AR clerk follows ([`match.mjs`](match.mjs)):

1. **Remittance numbers.** Invoice numbers in the memo, read as whole ids ("INV-1023"), split prefixes ("INV 1023"), lists ("1023/1024, 1031") and zero-padded digits ("001023"). If the payment equals the named invoices (after any discount their terms allow), the match is **High**. Named invoices paid short by no more than the bank-charge limit are **Medium** with a write-off; short by more, **Review**, applied oldest first with the balance left open. Paid over, the rest is searched among the same customer's invoices or left unapplied.
2. **Payer name.** Compared with each customer token by token after removing legal suffixes (LLC, Inc, GmbH ...), bank noise (ACH CREDIT, WIRE IN ...) and expanding abbreviations (MFG, ST, SVCS ...), with prefix matching for bank truncation.
3. **Amounts add up.** A depth-first subset search over the customer's open invoices, oldest first (up to 40 invoices, 250,000 nodes), for a combination totalling the payment. Each invoice may settle at its open amount or, inside the discount window, at the discounted amount. If nothing is exact, a second search allows a shortfall up to the bank-charge limit.
4. **Ties.** If more than one invoice set fits, the oldest set (FIFO) is proposed and the row is **Review**.
5. **Late discounts.** A shortfall equal to exactly the discount the terms offer, after the window closed, is never written off as a fee: it is **Review**, applied without the discount, and the gap stays open.
6. **Amount only.** No name or reference, exactly one open invoice for this amount: **Review**.

Each invoice is applied once; receipts are worked in date order, remittance matches before name matches before amount-only ones.

## Spec sources

Early-payment terms follow the standard trade-credit convention: "2/10 net 30" means a 2% discount if paid within 10 days of the invoice date, otherwise the full amount within 30 days (as taught in introductory financial accounting, e.g. the sales-discount treatment in OpenStax *Principles of Accounting, Volume 1*, section 6.3). FIFO application of an unspecified payment to the oldest open invoice is the common default in AR practice and in accounting systems' receive-payment screens. The professional who would sign this off is an AR supervisor or a CPA reviewing the posting policy. `test/match.test.mjs` pins the hand calculation: 2% of 1,000.00 is 20.00, so 980.00 paid on day 8 settles the invoice and on day 25 leaves 20.00 open.

## How well it works

Measured only on **generated data**: [`eval/synthetic.mjs`](eval/synthetic.mjs) builds customers, invoices (including equal-amount retainers) and bank lines with known answers, across the cases above. Five seeds, 1,606 receipts ([`eval/synthetic-2026-11-17.md`](eval/synthetic-2026-11-17.md)):

| Tier | Receipts | Exactly the right invoices |
|---|---:|---:|
| High | 1,146 | 99.8% |
| Medium | 185 | 97.3% |
| Review | 255 | 63.5% |
| Unmatched | 20 | 0% (nothing proposed) |

The misses in High and Medium are swaps between invoices of equal amount for the same customer, where an earlier receipt took the twin. No real company's statement has been run yet; that is the next measurement (a bookkeeper's anonymised export, or a public sample AR dataset with remittance text).

## Opportunity

- **Who:** AR clerks, bookkeepers and controllers at businesses invoicing other businesses (wholesale, distribution, trades, agencies, clinics on retainers), applying ACH, wire and cheque receipts by hand.
- **Pain:** multi-invoice payments with no remittance, fees and discounts taken off, and truncated payer names; it is the slow part of the AR day.
- **Alternatives:** enterprise cash-application modules in AR automation platforms (priced for mid-market and up, with lockbox integration), the receive-payment screen of QuickBooks or Xero (one payment at a time), and spreadsheets.
- **Wedge:** free, local, no connection, explainable; the open-source core others can self-host. A later paid tier could read emailed PDF remittance advices with the user's own model key.

## Privacy and usage

Everything runs in your browser (or on your machine with the CLI). Files are never uploaded; there are no accounts, cookies, tracking pixels or analytics vendors. The page counts `match_run`, `exceptions_listed`, `applications_exported` and `open_invoices_exported` in your own browser's `localStorage`, nothing else; a checkbox turns it off, and Do Not Track / Global Privacy Control are honoured.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. Do not use this as a system of record.

## Licence

FSL-1.1-MIT, see [LICENSE](LICENSE). Optional support: https://github.com/sponsors/Duncan-Haywood
